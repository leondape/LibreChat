import {
  SURVEY_STEPS,
  SURVEY_WISHES,
  SURVEY_CULTURE,
  SURVEY_LETDOWNS,
  SURVEY_REPLACED,
  SURVEY_TIME_USES,
  SURVEY_TASK_KINDS,
  SURVEY_JOB_FUNCTIONS,
  SURVEY_HOURS_RANGES,
  SURVEY_DISAPPOINTMENT,
  SURVEY_TASK_FREQUENCIES,
  SURVEY_TASK_DURATIONS,
  SURVEY_IMPROVEMENT_MAX,
} from 'librechat-data-provider';
import English from '~/locales/en/translation.json';
import German from '~/locales/de/translation.json';
import French from '~/locales/fr/translation.json';
import { surveyKey } from '../Step';

type Locale = Record<string, string>;
const locales: [string, Locale][] = [
  ['en', English],
  ['de', German],
  ['fr', French],
];

const surveyKeys = (locale: Locale) =>
  Object.keys(locale)
    .filter((key) => key.startsWith('com_survey_'))
    .sort();

const placeholders = (text: string) => (text.match(/{{\d+}}/g) ?? []).sort();

const options = (prefix: string, values: readonly string[]) =>
  values.map((value) => surveyKey(prefix, value));

/** Every key the dialog builds from an option id or a step id. */
const dynamicKeys = [
  ...options('job', SURVEY_JOB_FUNCTIONS),
  ...options('task', SURVEY_TASK_KINDS),
  ...options('frequency', SURVEY_TASK_FREQUENCIES),
  ...options('duration', SURVEY_TASK_DURATIONS),
  ...options('hours', SURVEY_HOURS_RANGES),
  ...options('timeuse', SURVEY_TIME_USES),
  ...options('replaced', SURVEY_REPLACED),
  ...options('disappointment', SURVEY_DISAPPOINTMENT),
  ...options('letdown', SURVEY_LETDOWNS),
  ...options('wish', SURVEY_WISHES),
  ...options('culture', SURVEY_CULTURE),
  ...options(
    'improvement',
    Array.from({ length: SURVEY_IMPROVEMENT_MAX }, (_, index) => String(index + 1)),
  ),
  ...SURVEY_STEPS.map((step) => surveyKey('q', step)),
  ...options('loader', ['generic_1', 'generic_2', 'generic_3', 'messages', 'tokens', 'agents']),
  ...options('loader', ['compare', 'polish']),
  ...options('success_title', ['1', '2', '3', '4']),
  ...options('card', [
    'messages',
    'tokens',
    'activeDays',
    'conversations',
    'files',
    'codeRuns',
    'spreadsheets',
    'scheduleRuns',
    'agentsOwned',
    'agentsCreated',
    'agentsShared',
    'agentsUsed',
    'agents',
    'toolCalls',
    'toolsDistinct',
    'mcpServers',
  ]),
  ...options('title', [
    'agent_architect',
    'automation_pro',
    'tool_explorer',
    'data_wrangler',
    'daily_driver',
    'power_prompter',
    'curious_explorer',
  ]),
  ...options('tip', ['tools', 'agents', 'schedules', 'code', 'files']),
];

describe.each(locales)('survey copy (%s)', (_name, locale) => {
  it('has every key the dialog builds from option and step ids', () => {
    const missing = dynamicKeys.filter((key) => !(key in locale));
    expect(missing).toEqual([]);
  });

  it('has no empty strings', () => {
    const empty = surveyKeys(locale).filter((key) => locale[key].trim() === '');
    expect(empty).toEqual([]);
  });
});

describe('survey copy across languages', () => {
  it.each([
    ['de', German],
    ['fr', French],
  ])('translates every English key into %s with the same placeholders', (_name, locale) => {
    const english = English as Locale;
    expect(surveyKeys(locale as Locale)).toEqual(surveyKeys(english));
    for (const key of surveyKeys(english)) {
      expect(placeholders((locale as Locale)[key])).toEqual(placeholders(english[key]));
    }
  });

  it('promises confidentiality, never anonymity', () => {
    for (const [, locale] of locales) {
      expect(locale.com_survey_intro_privacy).not.toMatch(/anonym/i);
    }
  });
});
