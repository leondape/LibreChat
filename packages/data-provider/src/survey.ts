import { z } from 'zod';

export const SURVEY_ID = 'wangpt-kpi';
export const SURVEY_VERSION = 1;
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

export const SURVEY_USE_CASES = [
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

export const SURVEY_TIME_COSTS = [
  'checking',
  'prompting',
  'errors',
  'limits',
  'learning',
  'nowhere',
] as const;

export const SURVEY_HELP = [
  'training',
  'time',
  'examples',
  'quality',
  'integrations',
  'data_access',
  'rules',
  'other',
] as const;

export const SURVEY_TOOLS = [
  'chatgpt',
  'copilot',
  'gemini',
  'claude',
  'deepl',
  'other',
  'none',
] as const;

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

export const SURVEY_HELP_MAX = 3;
export const SURVEY_QUALITY_MAX = 5;
export const SURVEY_SATISFACTION_MAX = 9;
export const SURVEY_HOURS_MAX = 80;
export const SURVEY_NOTE_MAX = 500;
export const SURVEY_FEEDBACK_MAX = 2000;

/** Options that, when chosen, must be the only selection of their question. */
export const SURVEY_EXCLUSIVE = { timeCosts: 'nowhere', tools: 'none' } as const;

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

export const surveyAnswersSchema = z
  .object({
    company: z.array(z.string().min(1).max(100)).min(1).max(12),
    jobFunction: z.enum(SURVEY_JOB_FUNCTIONS),
    jobOther: z.string().trim().max(100).optional(),
    useCases: uniqueEnumArray(SURVEY_USE_CASES),
    topUseCase: z.enum(SURVEY_USE_CASES),
    topUseCaseNote: note,
    hoursSaved: surveyHoursSavedSchema,
    timeUses: uniqueEnumArray(SURVEY_TIME_USES).optional(),
    quality: z.number().int().min(1).max(SURVEY_QUALITY_MAX),
    enabled: z.boolean(),
    enabledNote: note,
    timeCosts: uniqueEnumArray(SURVEY_TIME_COSTS),
    help: uniqueEnumArray(SURVEY_HELP).refine((items) => items.length <= SURVEY_HELP_MAX),
    trained: z.boolean(),
    tools: uniqueEnumArray(SURVEY_TOOLS),
    satisfaction: z.number().int().min(1).max(SURVEY_SATISFACTION_MAX),
    feedback: z.string().trim().max(SURVEY_FEEDBACK_MAX).optional(),
  })
  .strict();

export type TSurveyAnswers = z.infer<typeof surveyAnswersSchema>;
export type TSurveyHoursSaved = z.infer<typeof surveyHoursSavedSchema>;

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
  | 'useCases'
  | 'topUseCase'
  | 'hours'
  | 'timeUses'
  | 'quality'
  | 'enabled'
  | 'timeCosts'
  | 'help'
  | 'trained'
  | 'tools'
  | 'satisfaction'
  | 'feedback';

export const SURVEY_STEPS: readonly TSurveyStepId[] = [
  'company',
  'job',
  'useCases',
  'topUseCase',
  'hours',
  'timeUses',
  'quality',
  'enabled',
  'timeCosts',
  'help',
  'trained',
  'tools',
  'satisfaction',
  'feedback',
];

export function getSurveySteps(answers: Partial<TSurveyAnswers>): TSurveyStepId[] {
  return SURVEY_STEPS.filter(
    (step) => step !== 'timeUses' || hasSurveyTimeGain(answers.hoursSaved),
  );
}

const filled = (items?: readonly unknown[]) => (items?.length ?? 0) > 0;

export function isSurveyStepComplete(
  step: TSurveyStepId,
  answers: Partial<TSurveyAnswers>,
  companies: TSurveyCompany[],
): boolean {
  switch (step) {
    case 'company':
      return isSurveyCompanyLeafPath(companies, answers.company ?? []);
    case 'job':
      return answers.jobFunction !== undefined;
    case 'useCases':
      return filled(answers.useCases);
    case 'topUseCase':
      return (
        answers.topUseCase !== undefined && answers.useCases?.includes(answers.topUseCase) === true
      );
    case 'hours':
      return (
        answers.hoursSaved !== undefined &&
        (answers.hoursSaved.hours !== undefined || answers.hoursSaved.range !== undefined)
      );
    case 'timeUses':
      return filled(answers.timeUses);
    case 'quality':
      return answers.quality !== undefined;
    case 'enabled':
      return answers.enabled !== undefined;
    case 'timeCosts':
      return filled(answers.timeCosts);
    case 'help':
      return filled(answers.help);
    case 'trained':
      return answers.trained !== undefined;
    case 'tools':
      return filled(answers.tools);
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
  if (!answers.useCases.includes(answers.topUseCase)) {
    fields.push('topUseCase');
  }
  if (hasSurveyTimeGain(answers.hoursSaved) !== (answers.timeUses !== undefined)) {
    fields.push('timeUses');
  }
  if (answers.enabledNote !== undefined && !answers.enabled) {
    fields.push('enabledNote');
  }
  if (!isExclusiveValid(answers.timeCosts, SURVEY_EXCLUSIVE.timeCosts)) {
    fields.push('timeCosts');
  }
  if (!isExclusiveValid(answers.tools, SURVEY_EXCLUSIVE.tools)) {
    fields.push('tools');
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
