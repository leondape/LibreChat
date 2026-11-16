import { SURVEY_HOURS_MAX, SURVEY_MINUTES_MAX, hasSurveyTimeGain } from 'librechat-data-provider';
import type { TSurveyDraftAnswers, TSurveyStepId } from 'librechat-data-provider';

export type SurveyDraftAnswers = TSurveyDraftAnswers;

const clean = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const NOTES = ['letdownNote', 'wishTask', 'enabledNote', 'feedback'] as const;

/** Applies a change, then drops or fills every answer that depends on another one. */
export function applyAnswers(
  current: SurveyDraftAnswers,
  patch: SurveyDraftAnswers,
): SurveyDraftAnswers {
  const next: SurveyDraftAnswers = { ...current, ...patch };

  if (next.jobFunction !== 'other') {
    delete next.jobOther;
  } else if ('jobOther' in next) {
    next.jobOther = clean(next.jobOther);
  }

  if (next.bestTask) {
    const note = clean(next.bestTask.note);
    next.bestTask = { ...next.bestTask };
    if (note) {
      next.bestTask.note = note;
    } else {
      delete next.bestTask.note;
    }
  }

  if (!hasSurveyTimeGain(next.hoursSaved)) {
    delete next.timeUses;
  }

  if (next.enabled !== true) {
    delete next.enabledNote;
  }
  for (const field of NOTES) {
    if (!(field in next)) {
      continue;
    }
    const value = clean(next[field]);
    if (value) {
      next[field] = value;
    } else {
      delete next[field];
    }
  }
  return next;
}

/** Adds or removes `value`; an exclusive option replaces every other choice. */
export function toggleChoice(
  current: readonly string[] | undefined,
  value: string,
  exclusive?: string,
): string[] {
  const selected = current ?? [];
  if (selected.includes(value)) {
    return selected.filter((item) => item !== value);
  }
  if (value === exclusive) {
    return [value];
  }
  return [...selected.filter((item) => item !== exclusive), value];
}

const clampNumber = (input: string, max: number, step: number): number | undefined => {
  if (input.trim() === '') {
    return undefined;
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const snapped = step === 1 ? Math.round(value) : Math.round(value / step) * step;
  return Math.min(max, Math.max(0, snapped));
};

/** Turns what was typed into the number of weekly hours, clamped to the allowed range. */
export function parseHours(input: string): number | undefined {
  return clampNumber(input, SURVEY_HOURS_MAX, 0.5);
}

/** Turns what was typed into whole minutes, clamped to the allowed range. */
export function parseMinutes(input: string): number | undefined {
  return clampNumber(input, SURVEY_MINUTES_MAX, 1);
}

/** Same seed, same order. Pinned options stay at the end, in the order given. */
export function shuffleOptions<T extends string>(
  values: readonly T[],
  seed: string,
  pinned: readonly T[] = [],
): T[] {
  const stay = new Set(pinned);
  const moving = values.filter((value) => !stay.has(value));
  let state = 0;
  for (let index = 0; index < seed.length; index += 1) {
    state = (Math.imul(state, 31) + seed.charCodeAt(index)) >>> 0;
  }
  for (let index = moving.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    const current = moving[index];
    moving[index] = moving[swap];
    moving[swap] = current;
  }
  return [...moving, ...pinned.filter((value) => values.includes(value))];
}

export const isLastStep = (steps: readonly TSurveyStepId[], step: TSurveyStepId) =>
  steps[steps.length - 1] === step;
