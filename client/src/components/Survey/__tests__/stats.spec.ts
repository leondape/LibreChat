import type { TSurveyBin, TSurveyDay } from 'librechat-data-provider';
import {
  busiestDay,
  binIndex,
  binPosition,
  hasSpread,
  hasTimeStory,
  longestStreak,
  showAhead,
  showGain,
  taskSaving,
  topShares,
  weekdayTotals,
  workDaysPerYear,
} from '../stats';

const day = (date: string, messages: number): TSurveyDay => ({ date, messages });

describe('survey stats', () => {
  it('shows "ahead of" only from the 50th percentile up', () => {
    expect(showAhead(undefined)).toBe(false);
    expect(showAhead(49)).toBe(false);
    expect(showAhead(50)).toBe(true);
  });

  it('celebrates a colleague share only from 2 in 10', () => {
    expect(showGain(19)).toBe(false);
    expect(showGain(20)).toBe(true);
  });

  it('totals messages per weekday starting on Monday', () => {
    const totals = weekdayTotals([
      day('2026-05-18', 5), // Monday
      day('2026-05-24', 2), // Sunday
      day('2026-05-25', 1), // Monday
    ]);
    expect(totals).toEqual([6, 0, 0, 0, 0, 0, 2]);
  });

  it('finds the busiest day, the earliest on a tie, and none when quiet', () => {
    expect(busiestDay([day('2026-05-18', 3), day('2026-05-19', 3), day('2026-05-20', 1)])).toEqual(
      day('2026-05-18', 3),
    );
    expect(busiestDay([day('2026-05-18', 0)])).toBeUndefined();
  });

  it('counts the longest run of active days', () => {
    const days = [1, 2, 0, 3, 1, 1, 0].map((messages, i) => day(`2026-05-${10 + i}`, messages));
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak([])).toBe(0);
  });

  it('turns a weekly saving into working days a year', () => {
    expect(workDaysPerYear(3)).toBe(17);
  });

  it('computes a task saving only when it is faster', () => {
    const saving = taskSaving({
      durationWithout: 'thirty_60',
      durationWith: 'five_15',
      frequency: 'weekly',
    });
    expect(saving?.saved).toBeGreaterThan(0);
    expect(saving?.hoursPerMonth).toBeGreaterThan(0);
    expect(taskSaving({ durationWithout: 'five_15', durationWith: 'thirty_60' })).toBeUndefined();
    expect(taskSaving(undefined)).toBeUndefined();
  });

  describe('bins', () => {
    const bins: TSurveyBin[] = [
      { from: 0, to: 9, share: 40 },
      { from: 10, to: 19, share: 30 },
      { from: 20, share: 30 },
    ];

    it('places a value in the last bin that starts at or below it', () => {
      expect(binIndex(bins, 0)).toBe(0);
      expect(binIndex(bins, 15)).toBe(1);
      expect(binIndex(bins, 500)).toBe(2);
    });

    it('positions a value between 0 and 1 and clamps the open last bin', () => {
      expect(binPosition(bins, 0)).toBe(0);
      expect(binPosition(bins, 500)).toBeLessThanOrEqual(1);
      expect(binPosition(bins, 15)).toBeGreaterThan(1 / 3);
      expect(binPosition(bins, 15)).toBeLessThan(2 / 3);
    });

    it('needs at least three used bars to be worth drawing', () => {
      expect(hasSpread(bins)).toBe(true);
      expect(
        hasSpread([
          { from: 0, share: 100 },
          { from: 5, share: 0 },
          { from: 10, share: 0 },
        ]),
      ).toBe(false);
    });
  });

  it('ranks shares and always lists the own choice, skipping excluded ones', () => {
    const shares: Record<string, number> = { a: 50, b: 30, c: 10, d: 5, e: 5 };
    const rows = topShares(shares, 2, ['d'], ['b']);
    expect(rows.map((row) => row.key)).toEqual(['a', 'c', 'd']);
    expect(rows.find((row) => row.key === 'd')?.yours).toBe(true);
  });

  it('drops the time page without an own or colleague time story', () => {
    expect(hasTimeStory({ hoursSaved: { range: 'none' } })).toBe(false);
    expect(hasTimeStory({ hoursSaved: { range: 'none' } }, undefined)).toBe(false);
    expect(
      hasTimeStory({
        bestTask: { durationWithout: 'thirty_60', durationWith: 'five_15', frequency: 'weekly' },
      }),
    ).toBe(true);
  });
});
