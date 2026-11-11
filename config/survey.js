const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseArgs } = require('util');
const {
  SURVEY_DEFAULT_LOOKBACK_DAYS,
  SURVEY_DEFAULT_MIN_RESPONSES,
  SURVEY_DEFAULT_NUDGE_DAYS,
  surveyCompanyTreeSchema,
} = require('librechat-data-provider');
const { createModels, createMethods } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

const USAGE = `Usage:
  npm run survey:arm -- --companies <file.json> [--flight <id>] [--from <ISO>] [--to <ISO>]
                        [--lookback ${SURVEY_DEFAULT_LOOKBACK_DAYS}] [--min-responses ${SURVEY_DEFAULT_MIN_RESPONSES}]
                        [--nudge-days ${SURVEY_DEFAULT_NUDGE_DAYS.join(',')}] [--yes]
  npm run survey:close
  npm run survey:status`;

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(message) {
  console.red(message);
  silentExit(1);
}

function parseDate(name, value) {
  if (value === undefined) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail(`Invalid --${name}: use an ISO date such as 2026-01-15T08:00:00Z.`);
  }
  return date;
}

function positiveInteger(name, value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    fail(`Invalid --${name}: use a positive whole number.`);
  }
  return parsed;
}

function loadCompanies(file) {
  if (!file) {
    fail(`--companies is required.\n${USAGE}`);
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
  const parsed = surveyCompanyTreeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(`Invalid company tree at "${issue.path.join('.')}": ${issue.message}`);
  }
  return parsed.data;
}

function countLeaves(nodes) {
  return nodes.reduce(
    (total, node) => total + (node.children?.length ? countLeaves(node.children) : 1),
    0,
  );
}

function nudgeDays(value) {
  if (value === undefined) {
    return [...SURVEY_DEFAULT_NUDGE_DAYS];
  }
  const days = value.split(',').map((part) => Number(part.trim()));
  if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 1)) {
    fail(
      'Invalid --nudge-days: use positive whole numbers separated by commas, for example 1,2,4,7.',
    );
  }
  return days;
}

function describe(flight) {
  console.log(`  flight:        ${flight.flightId}`);
  console.log(`  status:        ${flight.status}`);
  console.log(`  opens:         ${flight.opensAt.toISOString()}`);
  console.log(`  closes:        ${flight.closesAt ? flight.closesAt.toISOString() : 'not set'}`);
  console.log(`  lookback:      ${flight.lookbackDays} days`);
  console.log(`  comparison at: ${flight.minResponses} responses`);
  console.log(`  nudges after:  ${flight.nudgeDays.join(', ')} days`);
  console.log(`  companies:     ${countLeaves(flight.companies)} leaves`);
}

async function arm(survey, values) {
  const companies = loadCompanies(values.companies);
  const opensAt = parseDate('from', values.from);
  const closesAt = parseDate('to', values.to);
  const lookbackDays = positiveInteger('lookback', values.lookback, SURVEY_DEFAULT_LOOKBACK_DAYS);
  const minResponses = positiveInteger(
    'min-responses',
    values['min-responses'],
    SURVEY_DEFAULT_MIN_RESPONSES,
  );
  const nudgeSchedule = nudgeDays(values['nudge-days']);
  if (opensAt && closesAt && closesAt <= opensAt) {
    fail('--to must be later than --from.');
  }
  const flightId =
    values.flight ?? `wangpt-kpi-${(opensAt ?? new Date()).toISOString().slice(0, 10)}`;

  console.yellow('This will close any running survey flight and show this one to every user.');
  describe({
    flightId,
    status: 'armed',
    opensAt: opensAt ?? new Date(),
    closesAt,
    lookbackDays,
    minResponses,
    nudgeDays: nudgeSchedule,
    companies,
  });
  if (!values.yes) {
    const confirm = await askQuestion('Arm this flight? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.yellow('Operation cancelled.');
      silentExit(0);
    }
  }
  const flight = await survey.armSurveyFlight({
    flightId,
    companies,
    lookbackDays,
    minResponses,
    nudgeDays: nudgeSchedule,
    opensAt,
    closesAt,
  });
  console.green(`Armed flight ${flight.flightId}.`);
}

async function close(survey) {
  const closed = await survey.closeSurveyFlight();
  console.green(closed > 0 ? `Closed ${closed} flight(s).` : 'No armed flight to close.');
}

async function status(survey) {
  const flight = await survey.getLatestSurveyFlight();
  if (!flight) {
    console.yellow('No survey flight has been armed yet.');
    return;
  }
  describe(flight);
  const stats = await survey.getSurveyStats(flight.flightId, new Date(Date.now() - 7 * DAY_MS));
  const rate = stats.accounts > 0 ? ((stats.responses / stats.accounts) * 100).toFixed(1) : '0.0';
  console.log(`  responses:     ${stats.responses} (${rate}% of ${stats.accounts} accounts)`);
  console.log(`  active (7d):   ${stats.activeAccounts} of ${stats.accounts} accounts`);
}

(async () => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      companies: { type: 'string' },
      flight: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
      lookback: { type: 'string' },
      'min-responses': { type: 'string' },
      'nudge-days': { type: 'string' },
      yes: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  if (!['arm', 'close', 'status'].includes(command)) {
    fail(USAGE);
  }

  await connect();
  createModels(mongoose);
  const survey = createMethods(mongoose);

  console.purple('--------------------------');
  console.purple(`WanGPT survey: ${command}`);
  console.purple('--------------------------');

  try {
    if (command === 'arm') {
      await arm(survey, values);
    } else if (command === 'close') {
      await close(survey);
    } else {
      await status(survey);
    }
  } catch (error) {
    console.red(`Survey ${command} failed:`, error.message);
    silentExit(1);
  }
  silentExit(0);
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
    process.exit(1);
  }
});
