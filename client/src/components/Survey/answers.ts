import { SURVEY_HOURS_MAX, hasSurveyTimeGain } from 'librechat-data-provider';
import type { TSurveyAnswers, TSurveyStepId } from 'librechat-data-provider';

export type SurveyDraftAnswers = Partial<TSurveyAnswers>;

const clean = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

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

  if (next.useCases && next.topUseCase && !next.useCases.includes(next.topUseCase)) {
    delete next.topUseCase;
  }
  if (next.useCases?.length === 1) {
    next.topUseCase = next.useCases[0];
  }
  if (!next.useCases?.length) {
    delete next.topUseCase;
  }

  if (!hasSurveyTimeGain(next.hoursSaved)) {
    delete next.timeUses;
  }

  if (next.enabled !== true) {
    delete next.enabledNote;
  }
  for (const field of ['topUseCaseNote', 'enabledNote', 'feedback'] as const) {
    if (field in next) {
      next[field] = clean(next[field]);
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

/** Turns what was typed into the number of weekly hours, clamped to the allowed range. */
export function parseHours(input: string): number | undefined {
  if (input.trim() === '') {
    return undefined;
  }
  const hours = Number(input);
  if (!Number.isFinite(hours)) {
    return undefined;
  }
  return Math.min(SURVEY_HOURS_MAX, Math.max(0, Math.round(hours * 2) / 2));
}

export const isLastStep = (steps: readonly TSurveyStepId[], step: TSurveyStepId) =>
  steps[steps.length - 1] === step;
