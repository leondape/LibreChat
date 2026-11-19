import { median, toBins, toGains } from './surveyDistribution';

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it('is not pulled up by a few heavy users', () => {
    expect(median([1, 2, 3, 4, 500])).toBe(3);
  });
});

describe('toBins', () => {
  it('returns nothing without respondents', () => {
    expect(toBins([])).toEqual([]);
  });

  it('uses round edges and shares that add up to about 100', () => {
    const values = Array.from({ length: 100 }, (_, index) => index * 3);
    const bins = toBins(values);

    expect(bins[0]).toEqual({ from: 0, to: 49, share: 17 });
    expect(bins.map((bin) => bin.from)).toEqual(bins.map((_, index) => index * 50));
    const total = bins.reduce((sum, bin) => sum + bin.share, 0);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  it('keeps the last bar open-ended so outliers still count', () => {
    const values = [...Array.from({ length: 99 }, (_, index) => index % 20), 100000];
    const bins = toBins(values);

    expect(bins).toHaveLength(8);
    expect(bins[bins.length - 1]).not.toHaveProperty('to');
    expect(bins[bins.length - 1].share).toBeGreaterThan(0);
    expect(bins.slice(0, -1).every((bin) => bin.to !== undefined)).toBe(true);
  });

  it('draws fewer bars for a small range and closes them all', () => {
    const bins = toBins([0, 1, 1, 2, 2, 2, 3]);

    expect(bins).toHaveLength(4);
    expect(bins.every((bin) => bin.to !== undefined)).toBe(true);
    expect(bins.map((bin) => bin.share)).toEqual([14, 29, 43, 14]);
  });

  it('puts everyone in one bar when nobody differs', () => {
    expect(toBins([0, 0, 0])).toEqual([{ from: 0, to: 0, share: 100 }]);
  });
});

describe('toGains', () => {
  it('is all zeros without respondents', () => {
    const gains = toGains([]);

    expect(gains.savers).toBe(0);
    expect(gains.medianHours).toBe(0);
    expect(gains.enabled).toBe(0);
    expect(gains.taskMinutes).toEqual({ without: 0, with: 0 });
    expect(Object.values(gains.hours).every((share) => share === 0)).toBe(true);
  });

  it('ignores people who could not say how much time they save', () => {
    const gains = toGains([
      { answers: { hoursSaved: { range: 'cant_say' } } },
      { answers: { hoursSaved: { hours: 2 }, timeUses: ['learning'] } },
    ]);

    expect(gains.savers).toBe(100);
    expect(gains.uses.learning).toBe(100);
    expect(gains.hours.two_five).toBe(100);
  });
});
