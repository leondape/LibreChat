import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { TSurveyResult } from 'librechat-data-provider';
import useFormatNumber from './format';
import { useLocalize } from '~/hooks';
import { surveyKey } from './Step';

export const COMPUTING_LINE_MS = 900;
export const COMPUTING_MIN_MS = 4000;

const GENERIC = ['generic_1', 'generic_2', 'generic_3'] as const;

type Line = { key: string; count?: number };

/** What the loader says once the respondent's own numbers are known. */
export function getRealLines(result: TSurveyResult): Line[] {
  const { usage, comparison } = result;
  const agents = usage.agentsOwned + usage.agentsUsedOthers;
  return [
    { key: 'messages', count: usage.messagesSent },
    { key: 'tokens', count: usage.tokensTotal },
    ...(agents > 0 ? [{ key: 'agents', count: agents }] : []),
    ...(comparison.averages
      ? [{ key: 'compare', count: Math.max(comparison.responses - 1, 0) }]
      : []),
    { key: 'polish' },
  ];
}

type ComputingProps = {
  windowDays: number;
  /** Absent while the request is still running. */
  result?: TSurveyResult;
  onComplete: () => void;
};

/**
 * Plays for at least `COMPUTING_MIN_MS`, even when the server answers sooner,
 * so a submission that really mines a month of activity does not look instant.
 */
export default function Computing({ windowDays, result, onComplete }: ComputingProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const startedAt = useRef(Date.now());
  const completeRef = useRef(onComplete);
  const [genericTick, setGenericTick] = useState(0);
  const [realTick, setRealTick] = useState(0);
  const lines = useMemo(() => (result ? getRealLines(result) : []), [result]);
  const hasResult = result !== undefined;

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const id = setInterval(() => {
      if (hasResult) {
        setRealTick((tick) => tick + 1);
        return;
      }
      setGenericTick((tick) => tick + 1);
    }, COMPUTING_LINE_MS);
    return () => clearInterval(id);
  }, [hasResult]);

  const lastLine = lines.length - 1;
  useEffect(() => {
    if (!hasResult || realTick < lastLine) {
      return;
    }
    const remaining = Math.max(
      COMPUTING_LINE_MS,
      COMPUTING_MIN_MS - (Date.now() - startedAt.current),
    );
    const id = setTimeout(() => completeRef.current(), remaining);
    return () => clearTimeout(id);
  }, [hasResult, realTick, lastLine]);

  const line = lines[Math.min(realTick, lastLine)];
  const text = line
    ? localize(surveyKey('loader', line.key), { 0: format(line.count ?? 0) })
    : localize(surveyKey('loader', GENERIC[genericTick % GENERIC.length]), { 0: windowDays });

  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-6 py-8 text-center">
      <Loader2
        className="size-12 animate-spin text-text-secondary motion-reduce:animate-none"
        aria-hidden="true"
      />
      <h2 id="survey-computing" className="text-xl font-semibold text-text-primary">
        {localize('com_survey_computing')}
      </h2>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-text-secondary">
        {text}
      </p>
    </div>
  );
}
