import { atom } from 'jotai';
import { SURVEY_VERSION } from 'librechat-data-provider';
import type { TSurveyDraftAnswers, TSurveyStepId } from 'librechat-data-provider';
import { createStorageAtom } from '~/store/jotai-utils';

export type SurveyStepId = TSurveyStepId | 'intro';

/** Answers typed so far, kept on this device only until the survey is submitted. */
export type SurveyDraft = {
  /** `version:userId:flightId`, so a shared browser or an older survey never reuses a draft. */
  key: string;
  step: SurveyStepId;
  answers: TSurveyDraftAnswers;
};

export const surveyDraftAtom = createStorageAtom<SurveyDraft | null>('wangptSurveyDraft', null);
export const surveyOpenAtom = atom(false);

export const getSurveyKey = (userId: string | undefined, flightId: string) =>
  `${SURVEY_VERSION}:${userId ?? 'anonymous'}:${flightId}`;
