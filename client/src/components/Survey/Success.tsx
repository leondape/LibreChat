import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '@librechat/client';
import type { TSurveyResult, TSurveyUsageValues } from 'librechat-data-provider';
import useFormatNumber from './format';
import { useLocalize } from '~/hooks';
import { surveyKey } from './Step';

const TITLE_COUNT = 4;

type Card = { key: string; value: number; average?: number };

const sumUsed = (values?: TSurveyUsageValues) =>
  values ? values.agentsUsedOwn + values.agentsUsedOthers : undefined;

export function getCards({ usage, comparison }: TSurveyResult): Card[] {
  const averages = comparison.averages;
  return [
    { key: 'messages', value: usage.messagesSent, average: averages?.messagesSent },
    { key: 'tokens', value: usage.tokensTotal, average: averages?.tokensTotal },
    { key: 'activeDays', value: usage.activeDays, average: averages?.activeDays },
    { key: 'conversations', value: usage.conversations, average: averages?.conversations },
    { key: 'files', value: usage.filesUploaded, average: averages?.filesUploaded },
    { key: 'codeRuns', value: usage.codeRuns, average: averages?.codeRuns },
    { key: 'spreadsheets', value: usage.spreadsheetUploads, average: averages?.spreadsheetUploads },
    { key: 'scheduleRuns', value: usage.scheduleRuns, average: averages?.scheduleRuns },
    { key: 'agentsOwned', value: usage.agentsOwned, average: averages?.agentsOwned },
    { key: 'agentsCreated', value: usage.agentsCreated, average: averages?.agentsCreated },
    { key: 'agentsShared', value: usage.agentsShared, average: averages?.agentsShared },
    {
      key: 'agentsUsed',
      value: usage.agentsUsedOwn + usage.agentsUsedOthers,
      average: sumUsed(averages),
    },
  ];
}

function fireConfetti() {
  const base = { disableForReducedMotion: true, zIndex: 1000, ticks: 220 };
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

type SuccessProps = { result: TSurveyResult; onClose: () => void };

export default function Success({ result, onClose }: SuccessProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const [titleIndex] = useState(() => Math.floor(Math.random() * TITLE_COUNT) + 1);
  const cards = useMemo(() => getCards(result), [result]);
  const { comparison, usage } = result;

  useEffect(() => {
    fireConfetti();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 id="survey-success" className="text-2xl font-semibold text-text-primary">
          {localize(surveyKey('success_title', String(titleIndex)))}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {localize('com_survey_success_subtitle', { 0: usage.windowDays })}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <li
            key={card.key}
            className="flex flex-col rounded-xl border border-border-light bg-surface-secondary p-3"
          >
            <span className="text-xs text-text-secondary">
              {localize(surveyKey('card', card.key))}
            </span>
            <span className="text-xl font-semibold text-text-primary">{format(card.value)}</span>
            {card.average !== undefined && (
              <span className="text-xs text-text-secondary">
                {localize('com_survey_average', { 0: format(card.average) })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {!comparison.averages && (
        <p className="text-center text-sm text-text-secondary">
          {localize('com_survey_comparison_locked', { 0: comparison.threshold })}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="submit" onClick={onClose}>
          {localize('com_survey_done')}
        </Button>
      </div>
    </div>
  );
}
