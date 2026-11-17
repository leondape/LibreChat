import type { TSurveyAnswers, TSurveyCompany } from './survey';
import {
  SURVEY_DEFAULT_NUDGE_DAYS,
  getSurveyNudgeDelayDays,
  getSurveySteps,
  isSurveyCompanyLeafPath,
  isSurveyStepComplete,
  parseSurveyAnswers,
  surveyCompanyTreeSchema,
  surveyNudgeSchema,
} from './survey';

const companies: TSurveyCompany[] = [
  {
    id: 'group',
    name: 'Group',
    children: [
      { id: 'studio', name: 'Studio', children: [{ id: 'studio-de', name: 'Studio DE' }] },
      { id: 'solo', name: 'Solo', children: [] },
    ],
  },
];

const valid = (): TSurveyAnswers => ({
  company: ['group', 'studio', 'studio-de'],
  jobFunction: 'legal',
  bestTask: {
    kind: 'write',
    note: 'Weekly pitch deck',
    durationWithout: 'one_two_h',
    durationWith: 'thirty_60',
    frequency: 'weekly',
  },
  hoursSaved: { hours: 2 },
  timeUses: ['more_same'],
  improvement: 4,
  enabled: false,
  replaced: ['translation'],
  disappointment: 'somewhat',
  letdowns: ['checking'],
  wishes: ['training', 'agents'],
  culture: 'encouraged',
  satisfaction: 7,
  contact: true,
});

describe('company tree', () => {
  it('requires a path that ends on a leaf', () => {
    expect(isSurveyCompanyLeafPath(companies, ['group', 'studio', 'studio-de'])).toBe(true);
    expect(isSurveyCompanyLeafPath(companies, ['group', 'solo'])).toBe(true);
    expect(isSurveyCompanyLeafPath(companies, ['group', 'studio'])).toBe(false);
    expect(isSurveyCompanyLeafPath(companies, ['studio-de'])).toBe(false);
    expect(isSurveyCompanyLeafPath(companies, [])).toBe(false);
  });

  it('rejects duplicate ids and empty trees', () => {
    const duplicate = [{ id: 'a', name: 'A', children: [{ id: 'a', name: 'A again' }] }];
    expect(surveyCompanyTreeSchema.safeParse(duplicate).success).toBe(false);
    expect(surveyCompanyTreeSchema.safeParse([]).success).toBe(false);
    expect(surveyCompanyTreeSchema.safeParse(companies).success).toBe(true);
  });
});

describe('parseSurveyAnswers', () => {
  it('accepts a complete submission', () => {
    expect(parseSurveyAnswers(valid(), companies)).toEqual({ ok: true, value: valid() });
  });

  it.each<[string, (answers: Record<string, unknown>) => void, string]>([
    ['a non-leaf company', (a) => (a.company = ['group', 'studio']), 'company'],
    ['an unknown option', (a) => (a.jobFunction = 'wizard'), 'jobFunction'],
    ['more than two wishes', (a) => (a.wishes = ['training', 'agents', 'examples']), 'wishes'],
    [
      'a task without a description',
      (a) => (a.bestTask = { ...(a.bestTask as object), note: '  ' }),
      'bestTask',
    ],
    [
      'an unknown task duration',
      (a) => (a.bestTask = { ...(a.bestTask as object), durationWithout: 'all_day' }),
      'bestTask',
    ],
    ['time uses without a time gain', (a) => (a.hoursSaved = { range: 'none' }), 'timeUses'],
    ['a missing time uses answer on a gain', (a) => delete a.timeUses, 'timeUses'],
    [
      'nothing mixed with something it replaced',
      (a) => (a.replaced = ['nothing', 'translation']),
      'replaced',
    ],
    ['nowhere mixed with a letdown', (a) => (a.letdowns = ['nowhere', 'checking']), 'letdowns'],
    ['both hours and a range', (a) => (a.hoursSaved = { hours: 1, range: 'none' }), 'hoursSaved'],
    ['an out of range scale', (a) => (a.satisfaction = 10), 'satisfaction'],
    ['an unexpected field', (a) => (a.userId = 'u1'), ''],
    ['an enabled note while not enabled', (a) => (a.enabledNote = 'x'), 'enabledNote'],
    ['an "other" text without other', (a) => (a.jobOther = 'x'), 'jobOther'],
    ['a replaced note without "other"', (a) => (a.replacedNote = 'x'), 'replacedNote'],
  ])('rejects %s', (_label, mutate, field) => {
    const answers = valid() as unknown as Record<string, unknown>;
    mutate(answers);
    const result = parseSurveyAnswers(answers, companies);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_answers');
      expect(result.error.fields).toContain(field);
    }
  });

  it('never echoes submitted values in the error', () => {
    const result = parseSurveyAnswers({ ...valid(), jobFunction: 'secret-value' }, companies);
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('accepts a replaced note only together with "other"', () => {
    const answers = { ...valid(), replaced: ['other' as const], replacedNote: 'A translator' };
    expect(parseSurveyAnswers(answers, companies).ok).toBe(true);
  });

  it('accepts a time-costing range without time uses', () => {
    const answers = { ...valid(), hoursSaved: { range: 'costs_time' } };
    delete (answers as Partial<TSurveyAnswers>).timeUses;
    expect(parseSurveyAnswers(answers, companies).ok).toBe(true);
  });
});

describe('steps', () => {
  it('asks where the time goes only when time is gained', () => {
    expect(getSurveySteps({})).not.toContain('timeUses');
    expect(getSurveySteps({ hoursSaved: { range: 'cant_say' } })).not.toContain('timeUses');
    expect(getSurveySteps({ hoursSaved: { range: 'costs_time' } })).not.toContain('timeUses');
    expect(getSurveySteps({ hoursSaved: { hours: 0 } })).not.toContain('timeUses');
    expect(getSurveySteps({ hoursSaved: { range: 'one_two' } })).toContain('timeUses');
    expect(getSurveySteps({ hoursSaved: { hours: 3 } })).toHaveLength(15);
    expect(getSurveySteps({})[2]).toBe('hours');
    expect(getSurveySteps({})[3]).toBe('bestTask');
  });

  it('tracks completion per step', () => {
    expect(isSurveyStepComplete('company', { company: ['group'] }, companies)).toBe(false);
    expect(isSurveyStepComplete('company', valid(), companies)).toBe(true);
    expect(
      isSurveyStepComplete(
        'bestTask',
        { bestTask: { kind: 'write', note: 'Pitch', durationWithout: 'thirty_60' } },
        companies,
      ),
    ).toBe(false);
    expect(isSurveyStepComplete('bestTask', valid(), companies)).toBe(true);
    expect(isSurveyStepComplete('wishes', { wishes: [] }, companies)).toBe(false);
    expect(isSurveyStepComplete('feedback', {}, companies)).toBe(true);
    expect(isSurveyStepComplete('contact', {}, companies)).toBe(false);
    expect(isSurveyStepComplete('contact', { contact: false }, companies)).toBe(true);
    expect(isSurveyStepComplete('enabled', { enabled: false }, companies)).toBe(true);
  });
});

describe('nudge schedule', () => {
  it('walks the default delays and then repeats the last one', () => {
    expect(
      SURVEY_DEFAULT_NUDGE_DAYS.map((_, index) =>
        getSurveyNudgeDelayDays(SURVEY_DEFAULT_NUDGE_DAYS, index),
      ),
    ).toEqual([1, 2, 4, 7]);
    expect(getSurveyNudgeDelayDays(SURVEY_DEFAULT_NUDGE_DAYS, 4)).toBe(7);
    expect(getSurveyNudgeDelayDays(SURVEY_DEFAULT_NUDGE_DAYS, 12)).toBe(7);
    expect(getSurveyNudgeDelayDays([3], -1)).toBe(3);
  });

  it('rejects an empty schedule', () => {
    expect(() => getSurveyNudgeDelayDays([], 0)).toThrow(/schedule/);
  });

  it('accepts a later or ignored nudge and nothing else', () => {
    expect(surveyNudgeSchema.parse({ flightId: 'f1', reason: 'later' })).toEqual({
      flightId: 'f1',
      reason: 'later',
    });
    expect(surveyNudgeSchema.safeParse({ flightId: 'f1', reason: 'ignored' }).success).toBe(true);
    expect(surveyNudgeSchema.safeParse({ flightId: 'f1', reason: 'never' }).success).toBe(false);
    expect(
      surveyNudgeSchema.safeParse({ flightId: 'f1', reason: 'later', note: 'secret' }).success,
    ).toBe(false);
    expect(surveyNudgeSchema.safeParse({ flightId: '', reason: 'later' }).success).toBe(false);
  });
});
