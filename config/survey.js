const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parseArgs } = require('util');
const {
  SURVEY_CULTURE,
  SURVEY_DEFAULT_LOOKBACK_DAYS,
  SURVEY_DEFAULT_MIN_RESPONSES,
  SURVEY_DEFAULT_NUDGE_DAYS,
  SURVEY_DISAPPOINTMENT,
  SURVEY_JOB_FUNCTIONS,
  SURVEY_TASK_DURATIONS,
  SURVEY_TASK_FREQUENCIES,
  SURVEY_TASK_KINDS,
  SURVEY_USAGE_KEYS,
  SURVEY_USAGE_VERSION,
  SURVEY_VERSION,
  parseSurveyAnswers,
  surveyCompanyTreeSchema,
} = require('librechat-data-provider');
const { createModels, createMethods } = require('@librechat/data-schemas');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const connect = require('./connect');

const USAGE = `Usage:
  npm run survey:arm -- --companies <file.json> [--flight <id>] [--from <ISO>] [--to <ISO>]
                        [--lookback ${SURVEY_DEFAULT_LOOKBACK_DAYS}] [--min-responses ${SURVEY_DEFAULT_MIN_RESPONSES}]
                        [--nudge-days ${SURVEY_DEFAULT_NUDGE_DAYS.join(',')}]
                        [--emails a@x.com,b@y.com] [--emails-file <emails.txt>] [--yes]
  npm run survey:close
  npm run survey:status
  npm run survey:seed -- --count 20 [--yes]
  npm run survey:unseed
  npm run survey:contacts

  With no --emails or --emails-file, the flight is shown to every user.`;

const EMAIL = /^\S+@\S+\.\S+$/;

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

function loadEmailFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(path.resolve(file), 'utf8');
  } catch (error) {
    fail(`Could not read ${file}: ${error.message}`);
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

/** Combines --emails and --emails-file. An empty result arms the flight for everyone. */
function parseEmails(values) {
  const fromFlag = values.emails
    ? values.emails
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : [];
  const fromFile = values['emails-file'] ? loadEmailFile(values['emails-file']) : [];
  const combined = [...fromFlag, ...fromFile];
  const invalid = combined.find((email) => !EMAIL.test(email));
  if (invalid) {
    fail(`Invalid email "${invalid}". Use addresses such as ada@example.com.`);
  }
  return [...new Set(combined.map((email) => email.toLowerCase()))];
}

async function warnUnmatched(emails) {
  if (emails.length === 0) {
    return;
  }
  const found = await mongoose.models.User.find({ email: { $in: emails } })
    .select('email')
    .lean();
  const known = new Set(found.map((user) => user.email));
  const missing = emails.filter((email) => !known.has(email));
  if (missing.length === 0) {
    return;
  }
  console.yellow(
    `No account yet for ${missing.length} email(s). They will see the survey if they sign up:`,
  );
  for (const email of missing) {
    console.yellow(`  ${email}`);
  }
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
  console.log(`  version:       ${flight.surveyVersion}`);
  if (flight.surveyVersion !== SURVEY_VERSION) {
    console.yellow(
      `  warning:       this build asks survey version ${SURVEY_VERSION}, so the flight will not be shown`,
    );
  }
  console.log(`  opens:         ${flight.opensAt.toISOString()}`);
  console.log(`  closes:        ${flight.closesAt ? flight.closesAt.toISOString() : 'not set'}`);
  console.log(`  lookback:      ${flight.lookbackDays} days`);
  console.log(`  comparison at: ${flight.minResponses} responses`);
  console.log(`  nudges after:  ${flight.nudgeDays.join(', ')} days`);
  console.log(`  companies:     ${countLeaves(flight.companies)} leaves`);
  console.log(
    `  audience:      ${flight.audience?.length ? `${flight.audience.length} emails` : 'everyone'}`,
  );
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
  const emails = parseEmails(values);
  const who = emails.length > 0 ? `${emails.length} listed users` : 'every user';

  console.yellow(`This will close any running survey flight and show this one to ${who}.`);
  describe({
    flightId,
    surveyVersion: SURVEY_VERSION,
    status: 'armed',
    opensAt: opensAt ?? new Date(),
    closesAt,
    lookbackDays,
    minResponses,
    nudgeDays: nudgeSchedule,
    companies,
    audience: emails,
  });
  await warnUnmatched(emails);
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
    ...(emails.length > 0 ? { audience: emails } : {}),
  });
  console.green(`Armed flight ${flight.flightId}.`);
}

async function close(survey) {
  const closed = await survey.closeSurveyFlight();
  console.green(closed > 0 ? `Closed ${closed} flight(s).` : 'No armed flight to close.');
}

function leaves(nodes, path = [], found = []) {
  for (const node of nodes) {
    const next = [...path, node.id];
    if (node.children?.length) {
      leaves(node.children, next, found);
    } else {
      found.push(next);
    }
  }
  return found;
}

/** Spread across the real options, with a few heavy users so a comparison has a shape. */
function seededResponse(index, flight) {
  const paths = leaves(flight.companies);
  const gain = index % 3 !== 0;
  let replaced = ['nothing'];
  if (index % 5 === 0) {
    replaced = ['other'];
  } else if (index % 2 === 0) {
    replaced = ['translation'];
  }
  const disappointment = SURVEY_DISAPPOINTMENT[index % SURVEY_DISAPPOINTMENT.length];
  const answers = {
    company: paths[index % paths.length],
    jobFunction: SURVEY_JOB_FUNCTIONS[index % SURVEY_JOB_FUNCTIONS.length],
    bestTask: {
      kind: SURVEY_TASK_KINDS[index % SURVEY_TASK_KINDS.length],
      note: `Seeded task ${index + 1}`,
      durationWithout: SURVEY_TASK_DURATIONS[Math.min(4, index % SURVEY_TASK_DURATIONS.length)],
      durationWith: SURVEY_TASK_DURATIONS[0],
      frequency: SURVEY_TASK_FREQUENCIES[index % SURVEY_TASK_FREQUENCIES.length],
    },
    hoursSaved: { range: gain ? 'two_five' : 'none' },
    ...(gain ? { timeUses: ['more_same'] } : {}),
    improvement: (index % 5) + 1,
    enabled: index % 4 === 0,
    ...(index % 4 === 0 ? { enabledNote: 'A task that was not possible before' } : {}),
    replaced,
    ...(replaced.includes('other') ? { replacedNote: 'A freelance editor' } : {}),
    disappointment,
    disappointmentNote: 'The weekly draft',
    letdowns: index % 2 === 0 ? ['checking'] : ['nowhere'],
    wishes: ['training'],
    culture: SURVEY_CULTURE[index % SURVEY_CULTURE.length],
    satisfaction: (index % 9) + 1,
    contact: index % 2 === 0,
  };
  const parsed = parseSurveyAnswers(answers, flight.companies);
  if (!parsed.ok) {
    fail(`Seeded answer ${index + 1} is invalid: ${parsed.error.fields.join(', ')}`);
  }
  const heavy = index < 3;
  const usage = {
    version: SURVEY_USAGE_VERSION,
    windowDays: flight.lookbackDays,
    ...Object.fromEntries(SURVEY_USAGE_KEYS.map((key) => [key, 0])),
    messagesSent: heavy ? 180 + index * 40 : index * 4,
    activeDays: heavy ? 18 : index % 8,
    conversations: heavy ? 12 : index % 4,
    toolCalls: heavy ? 24 : index % 3,
    toolsDistinct: heavy ? 6 : index % 2,
    mcpToolCalls: heavy ? 8 : 0,
    mcpServers: heavy ? 2 : 0,
    tokensTotal: heavy ? 400000 : index * 200,
    agentsOwned: heavy ? 3 : 0,
    agentsCreated: index === 0 ? 2 : 0,
    agentAudience: index === 0 ? 4 : 0,
    scheduleRuns: index === 1 ? 6 : 0,
    agentApiKeys: index === 1 ? 1 : 0,
    codeRuns: index === 2 ? 4 : 0,
    spreadsheetUploads: index === 2 ? 3 : 0,
    filesUploaded: index % 5 === 0 ? 2 : 0,
    topTools: heavy
      ? [
          { name: 'web_search', calls: 10 + index },
          { name: 'execute_code', calls: 6 },
          { name: 'lookup_mcp_docs', calls: 4 },
        ]
      : [],
  };
  usage.tokensInput = Math.round(usage.tokensTotal * 0.6);
  usage.tokensOutput = usage.tokensTotal - usage.tokensInput;
  return {
    flightId: flight.flightId,
    user: `seed-${index + 1}`,
    surveyVersion: flight.surveyVersion,
    company: parsed.value.company,
    jobFunction: parsed.value.jobFunction,
    answers: parsed.value,
    usage,
    submittedAt: new Date(),
  };
}

async function seed(survey, values) {
  const flight = await survey.getArmedSurveyFlight();
  if (!flight) {
    fail('No armed flight to seed. Arm one first.');
  }
  if (flight.surveyVersion !== SURVEY_VERSION) {
    fail(
      `The armed flight is survey version ${flight.surveyVersion}, this build is ${SURVEY_VERSION}.`,
    );
  }
  const count = positiveInteger('count', values.count, 20);
  console.yellow(
    `This will replace seeded answers on ${flight.flightId} with ${count} synthetic responses.`,
  );
  if (!values.yes) {
    const confirm = await askQuestion('Seed this flight? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.yellow('Operation cancelled.');
      silentExit(0);
    }
  }
  await mongoose.models.SurveyResponse.deleteMany({
    flightId: flight.flightId,
    user: { $regex: /^seed-/ },
  });
  for (let index = 0; index < count; index += 1) {
    const created = await survey.createSurveyResponse(seededResponse(index, flight));
    if (!created.ok) {
      fail(`Could not store seeded answer ${index + 1}.`);
    }
  }
  console.green(`Seeded ${count} responses on ${flight.flightId}.`);
}

async function unseed() {
  const result = await mongoose.models.SurveyResponse.deleteMany({ user: { $regex: /^seed-/ } });
  console.green(`Removed ${result.deletedCount} seeded response(s).`);
}

async function contacts(survey) {
  const flight = await survey.getLatestSurveyFlight();
  if (!flight) {
    console.yellow('No survey flight has been armed yet.');
    return;
  }
  const rows = await mongoose.models.SurveyResponse.find({
    flightId: flight.flightId,
    'answers.contact': true,
  })
    .select('user')
    .lean();
  const ids = rows.map((row) => row.user).filter((id) => mongoose.Types.ObjectId.isValid(id));
  const people =
    ids.length === 0
      ? []
      : await mongoose.models.User.find({ _id: { $in: ids } })
          .select('name email')
          .lean();
  console.log(`  flight:        ${flight.flightId}`);
  console.log(`  agreed:        ${rows.length}`);
  if (people.length === 0) {
    console.yellow('  No account could be matched to those answers.');
    return;
  }
  for (const person of people) {
    console.log(`  ${person.name || person.email}  ${person.email}`);
  }
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
      emails: { type: 'string' },
      'emails-file': { type: 'string' },
      yes: { type: 'boolean', default: false },
      count: { type: 'string' },
    },
  });
  const command = positionals[0];
  if (!['arm', 'close', 'status', 'seed', 'unseed', 'contacts'].includes(command)) {
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
    } else if (command === 'seed') {
      await seed(survey, values);
    } else if (command === 'unseed') {
      await unseed();
    } else if (command === 'contacts') {
      await contacts(survey);
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
