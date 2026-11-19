import {
  getSurveyHoursSaved,
  SURVEY_DURATION_MINUTES,
  SURVEY_FREQUENCY_PER_MONTH,
} from 'librechat-data-provider';
import type {
  TSurveyBin,
  TSurveyDay,
  TSurveyGains,
  TSurveyBestTask,
  TSurveyDraftAnswers,
} from 'librechat-data-provider';

/** "Ahead of X%" is a nice line to read from here up, and a put-down below it. */
export const AHEAD_MIN = 50;
/** A colleague stat under 2 in 10 would be a weak thing to celebrate. */
export const GAIN_MIN = 20;
const WORK_WEEKS = 46;
const WORK_DAY_HOURS = 8;

export const showAhead = (percentile?: number) =>
  percentile !== undefined && percentile >= AHEAD_MIN;

export const showGain = (share: number) => share >= GAIN_MIN;

/** Messages per weekday, Monday first. Days are `YYYY-MM-DD` in UTC. */
export function weekdayTotals(days: readonly TSurveyDay[]): number[] {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    totals[(weekday + 6) % 7] += day.messages;
  }
  return totals;
}

/** The day with the most messages; the earliest one on a tie. Absent when nothing was sent. */
export function busiestDay(days: readonly TSurveyDay[]): TSurveyDay | undefined {
  return days.reduce<TSurveyDay | undefined>(
    (top, day) => (day.messages > (top?.messages ?? 0) ? day : top),
    undefined,
  );
}

export function longestStreak(days: readonly TSurveyDay[]): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = day.messages > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** What a weekly saving adds up to over a year of 8-hour working days. */
export function workDaysPerYear(hoursPerWeek: number): number {
  return Math.round((hoursPerWeek * WORK_WEEKS) / WORK_DAY_HOURS);
}

export type TaskSaving = { without: number; with: number; saved: number; hoursPerMonth: number };

/** Minutes for one pass without and with WanGPT. Absent when it is no faster. */
export function taskSaving(task?: Partial<TSurveyBestTask>): TaskSaving | undefined {
  if (!task?.durationWithout || !task.durationWith) {
    return undefined;
  }
  const without = SURVEY_DURATION_MINUTES[task.durationWithout];
  const withTool = SURVEY_DURATION_MINUTES[task.durationWith];
  const saved = without - withTool;
  if (saved <= 0) {
    return undefined;
  }
  const perMonth = task.frequency ? SURVEY_FREQUENCY_PER_MONTH[task.frequency] : 0;
  return {
    without,
    with: withTool,
    saved,
    hoursPerMonth: Math.round(((saved * perMonth) / 60) * 10) / 10,
  };
}

/** The bar a value falls in: the last one that starts at or below it. */
export function binIndex(bins: readonly TSurveyBin[], value: number): number {
  let found = 0;
  bins.forEach((bin, index) => {
    if (bin.from <= value) {
      found = index;
    }
  });
  return found;
}

/** Where a value sits along the bars, from 0 (left edge) to 1 (right edge). */
export function binPosition(bins: readonly TSurveyBin[], value: number): number {
  if (bins.length === 0) {
    return 0;
  }
  const index = binIndex(bins, value);
  const bin = bins[index];
  const previous = bins[index - 1];
  const width =
    bin.to !== undefined ? bin.to + 1 - bin.from : bin.from - (previous?.from ?? 0) || 1;
  return Math.min(1, (index + Math.min(1, Math.max(0, (value - bin.from) / width))) / bins.length);
}

/** A histogram with fewer than three used bars says nothing worth drawing. */
export const hasSpread = (bins: readonly TSurveyBin[]) =>
  bins.filter((bin) => bin.share > 0).length >= 3;

export type ShareRow<K extends string> = { key: K; share: number; yours: boolean };

/**
 * The biggest shares first. Choices the person made are always listed, even
 * when they fall outside the top, so they can find themselves.
 */
export function topShares<K extends string>(
  shares: Record<K, number>,
  limit: number,
  own: readonly K[] = [],
  skip: readonly K[] = [],
): ShareRow<K>[] {
  const ranked = (Object.keys(shares) as K[])
    .filter((key) => !skip.includes(key))
    .sort((a, b) => shares[b] - shares[a] || a.localeCompare(b));
  const keys = ranked.slice(0, limit);
  for (const key of own) {
    if (!keys.includes(key) && !skip.includes(key) && key in shares) {
      keys.push(key);
    }
  }
  return keys.map((key) => ({ key, share: shares[key], yours: own.includes(key) }));
}

/** The weekly hours the person reports saving, when there are any. */
export function hoursSaved(answers: TSurveyDraftAnswers): number | undefined {
  const hours = getSurveyHoursSaved(answers.hoursSaved);
  return hours != null && hours > 0 ? hours : undefined;
}

/** Colleagues' typical minutes for a task, when WanGPT makes it faster. */
export function colleagueTask(gains?: TSurveyGains): { without: number; with: number } | undefined {
  const minutes = gains?.taskMinutes;
  return minutes && minutes.with > 0 && minutes.without > minutes.with ? minutes : undefined;
}

/** The time page is dropped when there is neither a saving of the person's own nor one of colleagues'. */
export function hasTimeStory(answers: TSurveyDraftAnswers, gains?: TSurveyGains): boolean {
  return (
    hoursSaved(answers) !== undefined ||
    taskSaving(answers.bestTask) !== undefined ||
    (gains !== undefined && showGain(gains.savers))
  );
}
