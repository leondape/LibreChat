import { applyAnswers, parseHours, parseMinutes, shuffleOptions, toggleChoice } from '../answers';

describe('applyAnswers', () => {
  it('drops the time uses once the hours no longer show a gain', () => {
    const gained = applyAnswers({}, { hoursSaved: { hours: 3 }, timeUses: ['new_tasks'] });
    expect(gained.timeUses).toEqual(['new_tasks']);

    const lost = applyAnswers(gained, { hoursSaved: { range: 'none' } });
    expect(lost.timeUses).toBeUndefined();
  });

  it('keeps no gain for a range nobody can put a number on', () => {
    const answers = applyAnswers({ timeUses: ['learning'] }, { hoursSaved: { range: 'cant_say' } });
    expect(answers.timeUses).toBeUndefined();
  });

  it('trims the task description and drops it when it is blank', () => {
    const filled = applyAnswers({}, { bestTask: { note: '  Pitch deck  ' } });
    expect(filled.bestTask?.note).toBe('Pitch deck');

    const blank = applyAnswers(filled, { bestTask: { note: '   ' } });
    expect(blank.bestTask).not.toHaveProperty('note');
  });

  it('keeps the job description only for "other" and trims it', () => {
    const other = applyAnswers({}, { jobFunction: 'other', jobOther: '  Archivist ' });
    expect(other.jobOther).toBe('Archivist');

    const legal = applyAnswers(other, { jobFunction: 'legal' });
    expect(legal).not.toHaveProperty('jobOther');
  });

  it('keeps the enabled note only while the answer is yes, and drops blank notes', () => {
    const yes = applyAnswers({}, { enabled: true, enabledNote: 'Reads PDFs in Swedish' });
    expect(yes.enabledNote).toBe('Reads PDFs in Swedish');

    const no = applyAnswers(yes, { enabled: false });
    expect(no).not.toHaveProperty('enabledNote');

    const blank = applyAnswers({}, { feedback: '   ' });
    expect(blank.feedback).toBeUndefined();
  });
});

describe('toggleChoice', () => {
  it('adds and removes a choice', () => {
    expect(toggleChoice(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChoice(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleChoice(undefined, 'a')).toEqual(['a']);
  });

  it('lets an exclusive option replace the rest, and any other choice replace it', () => {
    expect(toggleChoice(['a', 'b'], 'none', 'none')).toEqual(['none']);
    expect(toggleChoice(['none'], 'a', 'none')).toEqual(['a']);
    expect(toggleChoice(['none'], 'none', 'none')).toEqual([]);
  });
});

describe('parseHours', () => {
  it('turns typing into half-hour steps within the allowed range', () => {
    expect(parseHours('')).toBeUndefined();
    expect(parseHours('abc')).toBeUndefined();
    expect(parseHours('2.3')).toBe(2.5);
    expect(parseHours('-4')).toBe(0);
    expect(parseHours('500')).toBe(80);
  });
});

describe('parseMinutes', () => {
  it('turns typing into whole minutes within a day', () => {
    expect(parseMinutes('')).toBeUndefined();
    expect(parseMinutes('abc')).toBeUndefined();
    expect(parseMinutes('12.6')).toBe(13);
    expect(parseMinutes('-8')).toBe(0);
    expect(parseMinutes('9000')).toBe(1440);
  });
});

describe('shuffleOptions', () => {
  const values = ['a', 'b', 'c', 'd', 'e', 'other'] as const;

  it('keeps the same order for the same seed and pins the last options', () => {
    const once = shuffleOptions(values, 'user-1:flight', ['other']);
    const twice = shuffleOptions(values, 'user-1:flight', ['other']);
    expect(twice).toEqual(once);
    expect(once.at(-1)).toBe('other');
    expect(once.slice(0, -1).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(values).toEqual(['a', 'b', 'c', 'd', 'e', 'other']);
  });

  it('can order the same options differently for another person', () => {
    const first = shuffleOptions(values, 'user-1:flight', ['other']);
    const second = shuffleOptions(values, 'user-2:flight', ['other']);
    expect(second).not.toEqual(first);
  });
});
