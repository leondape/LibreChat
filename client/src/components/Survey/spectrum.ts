import type { TSurveyHoursRange } from 'librechat-data-provider';

/** A stop on a worse-to-better scale. Absent means the option sits outside it. */
export type SurveyTone = 'negative' | 'negative-soft' | 'neutral' | 'positive-soft' | 'positive';

export const HOURS_TONE: Partial<Record<TSurveyHoursRange, SurveyTone>> = {
  costs_time: 'negative',
  none: 'negative-soft',
  under_1: 'neutral',
  one_two: 'neutral',
  two_five: 'positive-soft',
  five_ten: 'positive-soft',
  over_ten: 'positive',
};

const IMPROVEMENT: readonly SurveyTone[] = [
  'negative',
  'negative-soft',
  'neutral',
  'positive-soft',
  'positive',
];

export function improvementTone(value: number): SurveyTone {
  return IMPROVEMENT[Math.min(IMPROVEMENT.length, Math.max(1, value)) - 1];
}

/** 1–2 worse, 5 no difference, 8–9 better. */
export function satisfactionTone(value: number): SurveyTone {
  if (value <= 2) {
    return 'negative';
  }
  if (value <= 4) {
    return 'negative-soft';
  }
  if (value <= 5) {
    return 'neutral';
  }
  if (value <= 7) {
    return 'positive-soft';
  }
  return 'positive';
}

export const CULTURE_TONE: Partial<Record<string, SurveyTone>> = {
  encouraged: 'positive',
  neutral: 'neutral',
  discouraged: 'negative',
};
