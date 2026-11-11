import { atom } from 'jotai';
import type { TSurveyAnswers, TSurveyStepId } from 'librechat-data-provider';
import { createStorageAtom } from '~/store/jotai-utils';

export type SurveyStepId = TSurveyStepId | 'intro';

/** Answers typed so far, kept on this device only until the survey is submitted. */
export type SurveyDraft = {
  /** `userId:flightId`, so a shared browser never shows one person another's draft. */
  key: string;
  step: SurveyStepId;
  answers: Partial<TSurveyAnswers>;
};

export const surveyDraftAtom = createStorageAtom<SurveyDraft | null>('wangptSurveyDraft', null);
export const surveyOpenAtom = atom(false);

export const getSurveyKey = (userId: string | undefined, flightId: string) =>
  `${userId ?? 'anonymous'}:${flightId}`;
