import {
  SURVEY_USAGE_KEYS,
  SURVEY_GAIN_USES,
  SURVEY_GAIN_RANGES,
  SURVEY_TASK_KINDS,
  SURVEY_DURATION_MINUTES,
  SURVEY_DISTRIBUTION_KEYS,
  getSurveyGainRange,
  getSurveyHoursSaved,
} from 'librechat-data-provider';
import type {
  TSurveyBin,
  TSurveyGains,
  TSurveyAnswers,
  TSurveyDistribution,
  TSurveyUsageValues,
} from 'librechat-data-provider';

/** Most bars a histogram draws. */
export const SURVEY_BINS = 8;

/** One respondent, reduced to what the comparison reads. */
export type SurveyRow = {
  usage?: Partial<TSurveyUsageValues>;
  answers?: Partial<Pick<TSurveyAnswers, 'hoursSaved' | 'timeUses' | 'bestTask' | 'enabled'>>;
};

type SurveyComparisonData = {
  percentiles: TSurveyUsageValues;
  distributions: Record<(typeof SURVEY_DISTRIBUTION_KEYS)[number], TSurveyDistribution>;
  gains: TSurveyGains;
};

const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 100);

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The next 1, 2 or 5 times a power of ten at or above `value`, never below 1. */
function niceStep(value: number): number {
  if (value <= 1) {
    return 1;
  }
  const base = 10 ** Math.floor(Math.log10(value));
  const fraction = value / base;
  const nice = [1, 2, 5, 10].find((step) => fraction <= step) ?? 10;
  return nice * base;
}

/**
 * Equal-width bars with round edges, sized so the bars reach the 95th percentile.
 * When someone sits beyond the last bar, it stays open-ended and holds them too.
 */
export function toBins(values: number[], maxBins: number = SURVEY_BINS): TSurveyBin[] {
  if (values.length === 0) {
    return [];
  }
  const sorted = [...values].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const cap = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
  const step = niceStep(cap / maxBins);
  const count = Math.min(maxBins, Math.floor(max / step) + 1);
  const tally = new Array<number>(count).fill(0);
  for (const value of sorted) {
    tally[Math.min(count - 1, Math.floor(value / step))] += 1;
  }
  const open = max >= count * step;
  return tally.map((size, index) => ({
    from: index * step,
    ...(index === count - 1 && open ? {} : { to: (index + 1) * step - 1 }),
    share: percent(size, values.length),
  }));
}

const read = (row: SurveyRow, key: keyof TSurveyUsageValues) => row.usage?.[key] ?? 0;

/** For each number, the share of the other respondents strictly below this person. */
function toPercentiles(rows: SurveyRow[], own: TSurveyUsageValues): TSurveyUsageValues {
  const others = Math.max(rows.length - 1, 0);
  return Object.fromEntries(
    SURVEY_USAGE_KEYS.map((key) => {
      const below = rows.filter((row) => read(row, key) < (own[key] ?? 0)).length;
      return [key, others === 0 ? 0 : percent(below, others)];
    }),
  ) as TSurveyUsageValues;
}

function toDistributions(rows: SurveyRow[]): SurveyComparisonData['distributions'] {
  return Object.fromEntries(
    SURVEY_DISTRIBUTION_KEYS.map((key) => {
      const values = rows.map((row) => read(row, key));
      return [key, { median: median(values), bins: toBins(values) }];
    }),
  ) as SurveyComparisonData['distributions'];
}

/** Only the positive answers: who gains time, how much, what for, and what became possible. */
export function toGains(rows: SurveyRow[]): TSurveyGains {
  const hours = rows
    .map((row) => ({ row, hours: getSurveyHoursSaved(row.answers?.hoursSaved) }))
    .filter((entry): entry is { row: SurveyRow; hours: number } => entry.hours != null);
  const savers = hours.filter((entry) => entry.hours > 0);
  const tasks = rows.flatMap((row) => (row.answers?.bestTask ? [row.answers.bestTask] : []));
  const enabled = rows.filter((row) => row.answers?.enabled != null);
  const minutes = (pick: 'durationWithout' | 'durationWith') =>
    median(
      tasks.flatMap((task) => {
        const value = task[pick] ? SURVEY_DURATION_MINUTES[task[pick]] : undefined;
        return value == null ? [] : [value];
      }),
    );

  return {
    savers: percent(savers.length, hours.length),
    medianHours: Math.round(median(savers.map((entry) => entry.hours)) * 10) / 10,
    hours: Object.fromEntries(
      SURVEY_GAIN_RANGES.map((range) => [
        range,
        percent(
          savers.filter((entry) => getSurveyGainRange(entry.hours) === range).length,
          savers.length,
        ),
      ]),
    ) as TSurveyGains['hours'],
    uses: Object.fromEntries(
      SURVEY_GAIN_USES.map((use) => [
        use,
        percent(
          savers.filter((entry) => entry.row.answers?.timeUses?.includes(use)).length,
          savers.length,
        ),
      ]),
    ) as TSurveyGains['uses'],
    tasks: Object.fromEntries(
      SURVEY_TASK_KINDS.map((kind) => [
        kind,
        percent(tasks.filter((task) => task.kind === kind).length, tasks.length),
      ]),
    ) as TSurveyGains['tasks'],
    taskMinutes: { without: minutes('durationWithout'), with: minutes('durationWith') },
    enabled: percent(enabled.filter((row) => row.answers?.enabled === true).length, enabled.length),
  };
}

/** Everything the result page compares, from one pass over the respondents. */
export function toComparison(rows: SurveyRow[], own: TSurveyUsageValues): SurveyComparisonData {
  return {
    percentiles: toPercentiles(rows, own),
    distributions: toDistributions(rows),
    gains: toGains(rows),
  };
}
