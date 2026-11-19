import { SURVEY_USAGE_KEYS } from 'librechat-data-provider';
import type {
  TSurveyBin,
  TSurveyDay,
  TSurveyResult,
  TSurveyFlight,
  TSurveyGains,
  TSurveyAnswers,
  TSurveyDistribution,
  TSurveyUsageValues,
  TSurveyDistributionKey,
} from 'librechat-data-provider';

export const flight: TSurveyFlight = {
  flightId: 'wangpt-kpi-test',
  surveyVersion: 3,
  lookbackDays: 30,
  minResponses: 50,
  companies: [
    {
      id: 'group',
      name: 'Group',
      children: [
        { id: 'studio', name: 'Studio', children: [{ id: 'drama', name: 'Drama' }] },
        { id: 'news', name: 'News' },
      ],
    },
  ],
};

export const answers: TSurveyAnswers = {
  company: ['group', 'news'],
  jobFunction: 'legal',
  bestTask: {
    kind: 'email',
    note: 'Weekly status mail',
    durationWithout: 'thirty_60',
    durationWith: 'five_15',
    frequency: 'weekly',
  },
  hoursSaved: { range: 'none' },
  improvement: 4,
  enabled: false,
  replaced: ['nothing'],
  disappointment: 'somewhat',
  letdowns: ['nowhere'],
  wishes: ['training'],
  culture: 'neutral',
  satisfaction: 7,
  contact: true,
};

const values = (
  value: number,
  overrides: Partial<TSurveyUsageValues> = {},
): TSurveyUsageValues => ({
  ...(Object.fromEntries(SURVEY_USAGE_KEYS.map((key) => [key, value])) as TSurveyUsageValues),
  ...overrides,
});

export const usage = values(0, {
  messagesSent: 1234,
  tokensTotal: 2500000,
  activeDays: 12,
  conversations: 40,
  agentsOwned: 2,
  agentsUsedOthers: 1,
});

const activity: TSurveyDay[] = Array.from({ length: 31 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 4, 20 + index)).toISOString().slice(0, 10);
  const messages = [0, 40, 120, 80, 0, 0, 0][index % 7] + (index % 3 === 0 ? 10 : 0);
  return { date, messages };
});

const bins = (shares: number[], step: number): TSurveyBin[] =>
  shares.map((share, index) => ({
    from: index * step,
    ...(index < shares.length - 1 ? { to: (index + 1) * step - 1 } : {}),
    share,
  }));

const distributions: Record<TSurveyDistributionKey, TSurveyDistribution> = {
  messagesSent: { median: 500, bins: bins([24, 19, 14, 11, 8, 6, 6, 12], 200) },
  activeDays: { median: 11, bins: bins([14, 18, 20, 17, 13, 10, 8], 4) },
  conversations: { median: 22, bins: bins([22, 24, 18, 12, 9, 6, 4, 5], 10) },
  toolCalls: { median: 45, bins: bins([52, 17, 10, 7, 5, 3, 2, 4], 50) },
};

const gains: TSurveyGains = {
  savers: 78,
  medianHours: 3,
  hours: { under_1: 16, one_two: 27, two_five: 34, five_ten: 15, over_ten: 8 },
  uses: { more_same: 41, new_tasks: 29, less_pressure: 38, more_care: 33, learning: 17 },
  tasks: {
    summarize: 24,
    write: 19,
    email: 16,
    translate: 13,
    research: 11,
    brainstorm: 4,
    analyze_data: 3,
    code: 2,
    presentations: 2,
    meetings: 2,
    legal_review: 1,
    other: 3,
  },
  taskMinutes: { without: 45, with: 22 },
  enabled: 62,
};

export const resultWaiting: TSurveyResult = {
  usage: { ...usage, version: 2, windowDays: 30, topTools: [] },
  activity,
  comparison: { ready: false },
};

export const resultReady: TSurveyResult = {
  usage: {
    ...usage,
    version: 2,
    windowDays: 30,
    topTools: [{ name: 'lookup_mcp_docs', calls: 4 }],
  },
  activity,
  comparison: {
    ready: true,
    percentiles: values(40, { messagesSent: 82 }),
    distributions,
    gains,
  },
};
