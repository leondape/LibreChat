import { useEffect, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { isAxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { getSurveySteps, isSurveyStepComplete, parseSurveyAnswers } from 'librechat-data-provider';
import {
  Button,
  Progress,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
} from '@librechat/client';
import type { TSurveyFlight, TSurveyResult } from 'librechat-data-provider';
import type { SurveyDraftAnswers } from './answers';
import type { SurveyStepId } from './store';
import { useSubmitSurveyMutation } from '~/data-provider';
import { getSurveyKey, surveyDraftAtom } from './store';
import { applyAnswers } from './answers';
import Step, { surveyKey } from './Step';
import { useLocalize } from '~/hooks';
import Computing from './Computing';
import Success from './Success';

type Phase = 'form' | 'computing' | 'success' | 'blocked';
type FormError = 'invalid_answers' | 'internal_error';

const MAX_DURATION_SECONDS = 86400;
const BLOCKING_CODES = ['already_submitted', 'survey_closed'];
/** Steps that carry a line of guidance under the question. */
const HINTS: SurveyStepId[] = [
  'company',
  'bestTask',
  'hours',
  'timeUses',
  'replaced',
  'letdowns',
  'wishes',
];

const getPrimaryLabel = (isIntro: boolean, isLast: boolean, hasDraft: boolean) => {
  if (isIntro) {
    return hasDraft ? 'com_survey_continue' : 'com_survey_start';
  }
  return isLast ? 'com_survey_submit' : 'com_survey_next';
};

type DialogProps = {
  flight: TSurveyFlight;
  userId?: string;
  onClose: () => void;
  onLater: () => void;
};

export default function SurveyDialog({ flight, userId, onClose, onLater }: DialogProps) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const key = getSurveyKey(userId, flight.flightId);
  const [draft, setDraft] = useAtom(surveyDraftAtom);
  const saved = draft?.key === key ? draft : null;

  const [answers, setAnswers] = useState<SurveyDraftAnswers>(saved?.answers ?? {});
  const [step, setStep] = useState<SurveyStepId>(saved?.step ?? 'intro');
  const [phase, setPhase] = useState<Phase>('form');
  const [result, setResult] = useState<TSurveyResult>();
  const [formError, setFormError] = useState<FormError>();
  const [blockedCode, setBlockedCode] = useState<string>();
  const openedAt = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps = getSurveySteps(answers);
  const current: SurveyStepId = step === 'intro' || steps.includes(step) ? step : 'intro';
  const index = current === 'intro' ? -1 : steps.indexOf(current);
  const isLast = index === steps.length - 1;
  const canContinue =
    current === 'intro' || isSurveyStepComplete(current, answers, flight.companies);

  const mutation = useSubmitSurveyMutation({
    onSuccess: (data) => {
      setDraft(null);
      setResult(data);
    },
    onError: (error) => {
      const code = isAxiosError(error) ? error.response?.data?.code : undefined;
      if (BLOCKING_CODES.includes(code)) {
        setDraft(null);
        setBlockedCode(code);
        setPhase('blocked');
        return;
      }
      setFormError(code === 'invalid_answers' ? 'invalid_answers' : 'internal_error');
      setPhase('form');
    },
  });

  useEffect(() => {
    if (phase !== 'form' || (current === 'intro' && Object.keys(answers).length === 0)) {
      return;
    }
    setDraft({ key, step: current, answers });
  }, [phase, key, current, answers, setDraft]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [current, phase]);

  const update = (patch: SurveyDraftAnswers) => {
    setFormError(undefined);
    setAnswers((previous) => applyAnswers(previous, patch));
  };

  const later = () => {
    onLater();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open || phase === 'computing') {
      return;
    }
    if (phase === 'form') {
      later();
      return;
    }
    onClose();
  };

  const go = (target: SurveyStepId) => {
    setFormError(undefined);
    setStep(target);
  };

  const submit = () => {
    const parsed = parseSurveyAnswers(answers, flight.companies);
    if (!parsed.ok) {
      setFormError('invalid_answers');
      return;
    }
    setFormError(undefined);
    setPhase('computing');
    mutation.mutate({
      flightId: flight.flightId,
      locale: i18n.language,
      durationSeconds: Math.min(
        MAX_DURATION_SECONDS,
        Math.round((Date.now() - openedAt.current) / 1000),
      ),
      answers: parsed.value,
    });
  };

  const handleNext = () => {
    if (isLast) {
      submit();
      return;
    }
    go(steps[index + 1]);
  };

  const questionId = 'survey-question';
  const primaryLabel = getPrimaryLabel(current === 'intro', isLast, saved !== null);
  const question = current === 'intro' ? undefined : current;

  return (
    <OGDialog open onOpenChange={handleOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-11/12 max-w-4xl border-none bg-surface-dialog text-text-primary"
        onInteractOutside={(event) => phase === 'computing' && event.preventDefault()}
      >
        <OGDialogHeader>
          <OGDialogTitle className={phase === 'form' ? undefined : 'sr-only'}>
            {localize('com_survey_title')}
          </OGDialogTitle>
        </OGDialogHeader>

        {phase === 'computing' && (
          <Computing
            windowDays={flight.lookbackDays}
            result={result}
            onComplete={() => setPhase('success')}
          />
        )}

        {phase === 'success' && result && (
          <Success result={result} answers={answers} flightId={flight.flightId} onClose={onClose} />
        )}

        {phase === 'blocked' && (
          <div className="flex flex-col gap-4" role="alert">
            <p className="text-sm text-text-primary">
              {localize(
                blockedCode === 'already_submitted'
                  ? 'com_survey_error_submitted'
                  : 'com_survey_error_closed',
              )}
            </p>
            <div className="flex justify-end">
              <Button variant="submit" onClick={onClose}>
                {localize('com_survey_done')}
              </Button>
            </div>
          </div>
        )}

        {phase === 'form' && (
          <div className="flex flex-col gap-6">
            {question && (
              <div className="flex flex-col gap-2">
                <Progress
                  value={((index + 1) / steps.length) * 100}
                  aria-label={localize('com_survey_progress', { 0: index + 1, 1: steps.length })}
                />
                <p className="text-xs text-text-secondary">
                  {localize('com_survey_progress', { 0: index + 1, 1: steps.length })}
                </p>
              </div>
            )}

            {current === 'intro' ? (
              <div className="flex flex-col gap-3">
                <h2
                  ref={headingRef}
                  id={questionId}
                  tabIndex={-1}
                  className="text-xl font-semibold text-text-primary focus:outline-none"
                >
                  {localize('com_survey_intro_title')}
                </h2>
                <p className="text-sm text-text-primary">
                  {localize('com_survey_intro_body', { 0: flight.lookbackDays })}
                </p>
                <p className="text-sm text-text-secondary">
                  {localize('com_survey_intro_privacy', { 0: 5, 1: flight.lookbackDays })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <h2
                    ref={headingRef}
                    id={questionId}
                    tabIndex={-1}
                    className="text-lg font-semibold text-text-primary focus:outline-none"
                  >
                    {localize(surveyKey('q', current))}
                  </h2>
                  {HINTS.includes(current) && (
                    <p className="mt-1 text-sm text-text-secondary">
                      {localize(surveyKey('q', current, 'hint'))}
                    </p>
                  )}
                </div>
                <Step
                  step={current}
                  answers={answers}
                  companies={flight.companies}
                  labelId={questionId}
                  seed={key}
                  onChange={update}
                />
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm text-text-destructive">
                {localize(
                  formError === 'invalid_answers'
                    ? 'com_survey_error_invalid'
                    : 'com_survey_error_generic',
                )}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={later}>
                {localize('com_survey_later')}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {current !== 'intro' && (
                  <Button
                    variant="outline"
                    onClick={() => go(index > 0 ? steps[index - 1] : 'intro')}
                  >
                    {localize('com_survey_back')}
                  </Button>
                )}
                <Button
                  variant="submit"
                  disabled={!canContinue}
                  onClick={() => (current === 'intro' ? go(steps[0]) : handleNext())}
                >
                  {localize(primaryLabel)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
