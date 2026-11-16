import { z } from 'zod';

export const SURVEY_ID = 'wangpt-kpi';
export const SURVEY_VERSION = 2;
export const SURVEY_USAGE_VERSION = 1;
export const SURVEY_DEFAULT_LOOKBACK_DAYS = 30;
export const SURVEY_DEFAULT_MIN_RESPONSES = 50;
/** Days to wait after each dismissal. The last entry repeats for the rest of the flight. */
export const SURVEY_DEFAULT_NUDGE_DAYS = [1, 2, 4, 7] as const;

export type TSurveyNudgeReason = 'later' | 'ignored';

/**
 * Delay for the next nudge. `dismissals` is how many times this person has
 * already sent the fish away before this one, so the first visit uses index 0.
 */
export function getSurveyNudgeDelayDays(schedule: readonly number[], dismissals: number): number {
  if (schedule.length === 0) {
    throw new Error('A nudge schedule needs at least one delay');
  }
  const index = Math.min(Math.max(0, Math.floor(dismissals)), schedule.length - 1);
  return schedule[index];
}

export type TSurveyCompany = { id: string; name: string; children?: TSurveyCompany[] };

export const surveyCompanySchema: z.ZodType<TSurveyCompany> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    children: z.array(surveyCompanySchema).optional(),
  }),
);

function collectIds(nodes: TSurveyCompany[], ids: string[] = []): string[] {
  for (const node of nodes) {
    ids.push(node.id);
    collectIds(node.children ?? [], ids);
  }
  return ids;
}

export const surveyCompanyTreeSchema = z
  .array(surveyCompanySchema)
  .min(1)
  .superRefine((tree, ctx) => {
    const ids = collectIds(tree);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate company id: ${duplicate}` });
    }
  });

/** True when `path` walks the tree from a root and ends on a node without children. */
export function isSurveyCompanyLeafPath(tree: TSurveyCompany[], path: string[]): boolean {
  let level: TSurveyCompany[] = tree;
  let node: TSurveyCompany | undefined;
  for (const id of path) {
    node = level.find((candidate) => candidate.id === id);
    if (!node) {
      return false;
    }
    level = node.children ?? [];
  }
  return node !== undefined && level.length === 0;
}

export const SURVEY_JOB_FUNCTIONS = [
  'development',
  'production',
  'post_production',
  'distribution',
  'acquisitions',
  'marketing',
  'communication',
  'legal',
  'finance',
  'hr',
  'it',
  'ai_team',
  'management',
  'administration',
  'other',
] as const;

/** Kinds of work a person can name as the task WanGPT helps with most. */
export const SURVEY_TASK_KINDS = [
  'summarize',
  'write',
  'email',
  'translate',
  'research',
  'brainstorm',
  'analyze_data',
  'code',
  'presentations',
  'meetings',
  'legal_review',
  'other',
] as const;

/** How often that task comes up. */
export const SURVEY_TASK_FREQUENCIES = [
  'daily',
  'few_week',
  'weekly',
  'few_month',
  'rarely',
] as const;

export const SURVEY_HOURS_RANGES = [
  'costs_time',
  'none',
  'under_1',
  'one_two',
  'two_five',
  'five_ten',
  'over_ten',
  'cant_say',
] as const;

export const SURVEY_TIME_USES = [
  'more_same',
  'new_tasks',
  'less_pressure',
  'evaporates',
  'more_care',
  'learning',
] as const;

/** What WanGPT replaced that used to be bought or asked of someone else. */
export const SURVEY_REPLACED = [
  'translation',
  'agency',
  'colleagues',
  'paid_tool',
  'nothing',
] as const;

export const SURVEY_DISAPPOINTMENT = ['very', 'somewhat', 'not'] as const;

/** Where WanGPT lets someone down or costs them time. */
export const SURVEY_LETDOWNS = [
  'checking',
  'wrong',
  'reach',
  'limits',
  'prompting',
  'rules',
  'nowhere',
] as const;

/** What would make the biggest difference. At most two may be chosen. */
export const SURVEY_WISHES = [
  'connect_tool',
  'data_access',
  'training',
  'agents',
  'examples',
  'answers',
  'other',
] as const;

/** How the person's team approaches AI. */
export const SURVEY_CULTURE = ['encouraged', 'tolerated', 'discouraged', 'never'] as const;

export type TSurveyHoursRange = (typeof SURVEY_HOURS_RANGES)[number];

/** Hours a range counts as; `null` ranges do not count towards the median. */
export const SURVEY_HOURS_VALUE: Record<TSurveyHoursRange, number | null> = {
  costs_time: -1,
  none: 0,
  under_1: 0.5,
  one_two: 1.5,
  two_five: 3.5,
  five_ten: 7.5,
  over_ten: 12,
  cant_say: null,
};

export const SURVEY_WISHES_MAX = 2;
/** 1 is clearly worse, 5 is clearly better. 3 is no difference. */
export const SURVEY_IMPROVEMENT_MAX = 5;
export const SURVEY_SATISFACTION_MAX = 9;
export const SURVEY_HOURS_MAX = 80;
/** A single task cannot be reported as taking longer than a day. */
export const SURVEY_MINUTES_MAX = 1440;
export const SURVEY_NOTE_MAX = 500;
export const SURVEY_FEEDBACK_MAX = 2000;

/** Options that, when chosen, must be the only selection of their question. */
export const SURVEY_EXCLUSIVE = { replaced: 'nothing', letdowns: 'nowhere' } as const;

const uniqueEnumArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .min(1)
    .refine((items) => new Set(items).size === items.length, 'Duplicate selection');

const note = z.string().trim().max(SURVEY_NOTE_MAX).optional();

export const surveyHoursSavedSchema = z
  .object({
    hours: z.number().min(0).max(SURVEY_HOURS_MAX).optional(),
    range: z.enum(SURVEY_HOURS_RANGES).optional(),
  })
  .strict()
  .refine((value) => (value.hours === undefined) !== (value.range === undefined), {
    message: 'Provide either hours or a range',
  });

export const surveyBestTaskSchema = z
  .object({
    kind: z.enum(SURVEY_TASK_KINDS),
    note: z.string().trim().min(1).max(SURVEY_NOTE_MAX),
    minutesWithout: z.number().int().min(0).max(SURVEY_MINUTES_MAX),
    minutesWith: z.number().int().min(0).max(SURVEY_MINUTES_MAX),
    frequency: z.enum(SURVEY_TASK_FREQUENCIES),
  })
  .strict();

export const surveyAnswersSchema = z
  .object({
    company: z.array(z.string().min(1).max(100)).min(1).max(12),
    jobFunction: z.enum(SURVEY_JOB_FUNCTIONS),
    jobOther: z.string().trim().max(100).optional(),
    bestTask: surveyBestTaskSchema,
    hoursSaved: surveyHoursSavedSchema,
    timeUses: uniqueEnumArray(SURVEY_TIME_USES).optional(),
    improvement: z.number().int().min(1).max(SURVEY_IMPROVEMENT_MAX),
    enabled: z.boolean(),
    enabledNote: note,
    replaced: uniqueEnumArray(SURVEY_REPLACED),
    disappointment: z.enum(SURVEY_DISAPPOINTMENT),
    letdowns: uniqueEnumArray(SURVEY_LETDOWNS),
    letdownNote: note,
    wishes: uniqueEnumArray(SURVEY_WISHES).refine((items) => items.length <= SURVEY_WISHES_MAX),
    wishTask: note,
    culture: z.enum(SURVEY_CULTURE),
    satisfaction: z.number().int().min(1).max(SURVEY_SATISFACTION_MAX),
    feedback: z.string().trim().max(SURVEY_FEEDBACK_MAX).optional(),
  })
  .strict();

export type TSurveyAnswers = z.infer<typeof surveyAnswersSchema>;
export type TSurveyBestTask = z.infer<typeof surveyBestTaskSchema>;
export type TSurveyHoursSaved = z.infer<typeof surveyHoursSavedSchema>;

/**
 * Answers while the form is still being filled. `bestTask` is filled one
 * field at a time, so it is partial until the step is complete.
 */
export type TSurveyDraftAnswers = Omit<Partial<TSurveyAnswers>, 'bestTask'> & {
  bestTask?: Partial<TSurveyBestTask>;
};

/** The hours a person reports saving, or `null` when they cannot say. */
export function getSurveyHoursSaved(hoursSaved?: Partial<TSurveyHoursSaved>): number | null {
  if (!hoursSaved) {
    return null;
  }
  if (hoursSaved.hours !== undefined) {
    return hoursSaved.hours;
  }
  return hoursSaved.range !== undefined ? SURVEY_HOURS_VALUE[hoursSaved.range] : null;
}

/** Only people who gain time are asked where it goes. */
export function hasSurveyTimeGain(hoursSaved?: Partial<TSurveyHoursSaved>): boolean {
  const hours = getSurveyHoursSaved(hoursSaved);
  return hours != null && hours > 0;
}

export type TSurveyStepId =
  | 'company'
  | 'job'
  | 'bestTask'
  | 'hours'
  | 'timeUses'
  | 'improvement'
  | 'enabled'
  | 'replaced'
  | 'disappointment'
  | 'letdowns'
  | 'wishes'
  | 'culture'
  | 'satisfaction'
  | 'feedback';

export const SURVEY_STEPS: readonly TSurveyStepId[] = [
  'company',
  'job',
  'bestTask',
  'hours',
  'timeUses',
  'improvement',
  'enabled',
  'replaced',
  'disappointment',
  'letdowns',
  'wishes',
  'culture',
  'satisfaction',
  'feedback',
];

export function getSurveySteps(answers: TSurveyDraftAnswers): TSurveyStepId[] {
  return SURVEY_STEPS.filter(
    (step) => step !== 'timeUses' || hasSurveyTimeGain(answers.hoursSaved),
  );
}

const filled = (items?: readonly unknown[]) => (items?.length ?? 0) > 0;

const described = (value?: string) => (value?.trim().length ?? 0) > 0;

export function isSurveyStepComplete(
  step: TSurveyStepId,
  answers: TSurveyDraftAnswers,
  companies: TSurveyCompany[],
): boolean {
  switch (step) {
    case 'company':
      return isSurveyCompanyLeafPath(companies, answers.company ?? []);
    case 'job':
      return answers.jobFunction !== undefined;
    case 'bestTask': {
      const task = answers.bestTask;
      return (
        task?.kind !== undefined &&
        described(task?.note) &&
        task?.minutesWithout !== undefined &&
        task?.minutesWith !== undefined &&
        task?.frequency !== undefined
      );
    }
    case 'hours':
      return (
        answers.hoursSaved !== undefined &&
        (answers.hoursSaved.hours !== undefined || answers.hoursSaved.range !== undefined)
      );
    case 'timeUses':
      return filled(answers.timeUses);
    case 'improvement':
      return answers.improvement !== undefined;
    case 'enabled':
      return answers.enabled !== undefined;
    case 'replaced':
      return filled(answers.replaced);
    case 'disappointment':
      return answers.disappointment !== undefined;
    case 'letdowns':
      return filled(answers.letdowns);
    case 'wishes':
      return filled(answers.wishes);
    case 'culture':
      return answers.culture !== undefined;
    case 'satisfaction':
      return answers.satisfaction !== undefined;
    case 'feedback':
      return true;
  }
}

export type TSurveyErrorCode = 'invalid_answers' | 'survey_closed' | 'already_submitted';

export type TSurveyParseResult =
  | { ok: true; value: TSurveyAnswers }
  | { ok: false; error: { code: 'invalid_answers'; fields: string[] } };

const invalid = (fields: string[]): TSurveyParseResult => ({
  ok: false,
  error: { code: 'invalid_answers', fields },
});

const isExclusiveValid = (items: readonly string[], exclusive: string) =>
  !items.includes(exclusive) || items.length === 1;

/** Validates a submission against the shared definition and the flight's company tree. */
export function parseSurveyAnswers(
  input: unknown,
  companies: TSurveyCompany[],
): TSurveyParseResult {
  const parsed = surveyAnswersSchema.safeParse(input);
  if (!parsed.success) {
    return invalid(
      Array.from(new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')))),
    );
  }
  const answers = parsed.data;
  const fields: string[] = [];
  if (!isSurveyCompanyLeafPath(companies, answers.company)) {
    fields.push('company');
  }
  if (answers.jobOther !== undefined && answers.jobFunction !== 'other') {
    fields.push('jobOther');
  }
  if (hasSurveyTimeGain(answers.hoursSaved) !== (answers.timeUses !== undefined)) {
    fields.push('timeUses');
  }
  if (answers.enabledNote !== undefined && !answers.enabled) {
    fields.push('enabledNote');
  }
  if (!isExclusiveValid(answers.replaced, SURVEY_EXCLUSIVE.replaced)) {
    fields.push('replaced');
  }
  if (!isExclusiveValid(answers.letdowns, SURVEY_EXCLUSIVE.letdowns)) {
    fields.push('letdowns');
  }
  return fields.length > 0 ? invalid(fields) : { ok: true, value: answers };
}

/** Every number the usage snapshot stores per person; averages are taken per key. */
export const SURVEY_USAGE_KEYS = [
  'messagesSent',
  'responsesReceived',
  'activeDays',
  'activeWeeks',
  'conversations',
  'medianMessagesPerConversation',
  'daysSinceFirstUse',
  'tokensInput',
  'tokensOutput',
  'tokensTotal',
  'agentsOwned',
  'agentsCreated',
  'agentsShared',
  'agentsUsedOwn',
  'agentsUsedOthers',
  'agentAudience',
  'skillsOwned',
  'schedulesActive',
  'scheduleRuns',
  'agentApiKeys',
  'promptsOwned',
  'promptsShared',
  'filesUploaded',
  'codeRuns',
  'spreadsheetUploads',
  'regenerations',
  'failedResponses',
  'feedbackUp',
  'feedbackDown',
] as const;

export type TSurveyUsageKey = (typeof SURVEY_USAGE_KEYS)[number];
export type TSurveyUsageValues = Record<TSurveyUsageKey, number>;
export type TSurveyUsage = TSurveyUsageValues & { version: number; windowDays: number };

export type TSurveyFlight = {
  flightId: string;
  surveyVersion: number;
  lookbackDays: number;
  minResponses: number;
  companies: TSurveyCompany[];
};

export type TSurveyStatus = {
  flight: TSurveyFlight | null;
  submitted: boolean;
  /** When the fish may visit again. Null means it has not been sent away. */
  nextNudgeAt: string | null;
};

export const surveyNudgeSchema = z
  .object({
    flightId: z.string().min(1).max(100),
    reason: z.enum(['later', 'ignored']),
  })
  .strict();

export type TSurveyNudge = z.infer<typeof surveyNudgeSchema>;

export type TSurveyNudgeResult = { nextNudgeAt: string; delayDays: number };

export type TSurveyComparison = {
  responses: number;
  threshold: number;
  /** Present only once `responses` reaches `threshold`. */
  averages?: TSurveyUsageValues;
};

export type TSurveyResult = { usage: TSurveyUsage; comparison: TSurveyComparison };

export const surveySubmissionSchema = z
  .object({
    flightId: z.string().min(1).max(100),
    locale: z.string().max(20).optional(),
    durationSeconds: z.number().int().min(0).max(86400).optional(),
    answers: z.unknown(),
  })
  .strict();

export type TSurveySubmission = {
  flightId: string;
  locale?: string;
  durationSeconds?: number;
  answers: TSurveyAnswers;
};
