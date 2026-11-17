import { SURVEY_USAGE_KEYS } from 'librechat-data-provider';
import type {
  TSurveyResult,
  TSurveyFlight,
  TSurveyAnswers,
  TSurveyUsageValues,
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

export const resultWithoutAverages: TSurveyResult = {
  usage: { ...usage, version: 2, windowDays: 30, topTools: [] },
  comparison: { responses: 12, threshold: 50 },
};

export const resultWithAverages: TSurveyResult = {
  usage: {
    ...usage,
    version: 2,
    windowDays: 30,
    topTools: [{ name: 'lookup_mcp_docs', calls: 4 }],
  },
  comparison: {
    responses: 80,
    threshold: 50,
    averages: values(5, { messagesSent: 321 }),
    percentiles: values(40, { messagesSent: 82 }),
  },
};
