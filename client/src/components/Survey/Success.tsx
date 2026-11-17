import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '@librechat/client';
import { getSurveyHoursSaved } from 'librechat-data-provider';
import {
  Bot,
  Blocks,
  Compass,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  MessageSquare,
  Share2,
  Table,
  Wrench,
} from 'lucide-react';
import type { TSurveyDraftAnswers, TSurveyResult, TSurveyUsageKey } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import type { SurveyTitleId } from './title';
import { useShareImage } from './Share/useShareImage';
import { formatToolName } from './tools';
import { getSurveyTitle } from './title';
import useFormatNumber from './format';
import { useLocalize } from '~/hooks';
import { surveyKey } from './Step';
import Card from './Share/Card';

const TITLE_ICON: Record<SurveyTitleId, LucideIcon> = {
  agent_architect: Blocks,
  automation_pro: CalendarClock,
  tool_explorer: Wrench,
  data_wrangler: Table,
  daily_driver: CalendarCheck,
  power_prompter: MessageSquare,
  curious_explorer: Compass,
};

type Headline = {
  key: string;
  icon: LucideIcon;
  value: number;
  usageKey: TSurveyUsageKey;
};

const MORE: { key: string; usageKey: TSurveyUsageKey; read: (result: TSurveyResult) => number }[] =
  [
    { key: 'tokens', usageKey: 'tokensTotal', read: (result) => result.usage.tokensTotal },
    {
      key: 'conversations',
      usageKey: 'conversations',
      read: (result) => result.usage.conversations,
    },
    { key: 'files', usageKey: 'filesUploaded', read: (result) => result.usage.filesUploaded },
    { key: 'codeRuns', usageKey: 'codeRuns', read: (result) => result.usage.codeRuns },
    {
      key: 'spreadsheets',
      usageKey: 'spreadsheetUploads',
      read: (result) => result.usage.spreadsheetUploads,
    },
    { key: 'scheduleRuns', usageKey: 'scheduleRuns', read: (result) => result.usage.scheduleRuns },
    {
      key: 'agentsCreated',
      usageKey: 'agentsCreated',
      read: (result) => result.usage.agentsCreated,
    },
    { key: 'agentsShared', usageKey: 'agentsShared', read: (result) => result.usage.agentsShared },
    {
      key: 'agentsUsed',
      usageKey: 'agentsUsedOthers',
      read: (result) => result.usage.agentsUsedOwn + result.usage.agentsUsedOthers,
    },
    {
      key: 'toolsDistinct',
      usageKey: 'toolsDistinct',
      read: (result) => result.usage.toolsDistinct,
    },
    { key: 'mcpServers', usageKey: 'mcpServers', read: (result) => result.usage.mcpServers },
  ];

const TIPS: { id: string; when: (result: TSurveyResult) => boolean }[] = [
  { id: 'tools', when: (result) => result.usage.toolCalls === 0 },
  { id: 'agents', when: (result) => result.usage.agentsOwned === 0 },
  {
    id: 'schedules',
    when: (result) => result.usage.scheduleRuns === 0 && result.usage.schedulesActive === 0,
  },
  { id: 'code', when: (result) => result.usage.codeRuns === 0 },
  { id: 'files', when: (result) => result.usage.filesUploaded === 0 },
];

function reducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const whole = Number.isInteger(value);
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(value * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(whole ? Math.round(shown) : shown)}</>;
}

function fireConfetti() {
  const base = { disableForReducedMotion: true, zIndex: 1000, ticks: 220 };
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...base, particleCount: 90, spread: 70, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

type SuccessProps = {
  result: TSurveyResult;
  answers: TSurveyDraftAnswers;
  flightId: string;
  onClose: () => void;
};

export default function Success({ result, answers, flightId, onClose }: SuccessProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const cardRef = useRef<HTMLDivElement>(null);
  const { usage, comparison } = result;
  const titleId = getSurveyTitle(usage);
  const TitleIcon = TITLE_ICON[titleId];
  const titleName = localize(surveyKey('title', titleId));
  const title = localize('com_survey_title_you', { 0: titleName });
  const hours = getSurveyHoursSaved(answers.hoursSaved);
  const hoursLabel =
    hours != null && hours > 0
      ? localize('com_survey_hours_chip', { 0: format(hours) })
      : undefined;
  const headlines: Headline[] = [
    { key: 'messages', icon: MessageSquare, value: usage.messagesSent, usageKey: 'messagesSent' },
    { key: 'activeDays', icon: CalendarDays, value: usage.activeDays, usageKey: 'activeDays' },
    { key: 'toolCalls', icon: Wrench, value: usage.toolCalls, usageKey: 'toolCalls' },
    { key: 'agents', icon: Bot, value: usage.agentsOwned, usageKey: 'agentsOwned' },
  ];
  const more = MORE.map((item) => ({ ...item, value: item.read(result) })).filter(
    (item) => item.value > 0,
  );
  const tips = TIPS.filter((tip) => tip.when(result)).slice(0, 2);
  const top = usage.topTools ?? [];
  const busiest = top.reduce((max, tool) => Math.max(max, tool.calls), 0);
  const period = localize('com_survey_share_period', {
    0: usage.windowDays,
    1: new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date()),
  });
  const { state, share } = useShareImage(() => cardRef.current, `wangpt-${flightId}.png`);

  useEffect(() => {
    fireConfetti();
  }, []);

  const shareStats = headlines.map((item) => ({
    label: localize(surveyKey('card', item.key)),
    value: format(item.value),
    detail: comparison.percentiles
      ? localize('com_survey_ahead', { 0: String(comparison.percentiles[item.usageKey]) })
      : undefined,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-highlight text-text-on-highlight">
          <TitleIcon className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h2 id="survey-success" className="text-2xl font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_survey_success_subtitle', { 0: usage.windowDays })}
          </p>
          {hoursLabel && (
            <p className="mt-2 w-fit rounded-full bg-surface-highlight px-3 py-1 text-sm text-text-on-highlight">
              {hoursLabel}
            </p>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headlines.map((item) => {
          const Icon = item.icon;
          const average = comparison.averages?.[item.usageKey];
          const percentile = comparison.percentiles?.[item.usageKey];
          return (
            <li
              key={item.key}
              className="flex flex-col gap-1 rounded-xl border border-border-light bg-surface-secondary p-3"
            >
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Icon className="size-3.5" aria-hidden="true" />
                {localize(surveyKey('card', item.key))}
              </span>
              <span className="text-2xl font-semibold text-text-primary">
                <CountUp value={item.value} format={format} />
              </span>
              {percentile !== undefined && (
                <span className="text-xs text-text-secondary">
                  {localize('com_survey_ahead', { 0: String(percentile) })}
                </span>
              )}
              {average !== undefined && (
                <span className="text-xs text-text-secondary">
                  {localize('com_survey_average', { 0: format(average) })}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border-light p-4">
          <h3 className="text-sm font-medium text-text-primary">
            {localize('com_survey_top_tools')}
          </h3>
          {top.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">{localize('com_survey_no_tools')}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {top.map((tool) => (
                <li key={tool.name} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm text-text-primary">
                    {formatToolName(tool.name)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                    <span
                      className="block h-full rounded-full bg-surface-highlight"
                      style={{ width: `${busiest === 0 ? 0 : (tool.calls / busiest) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-xs text-text-secondary">
                    {format(tool.calls)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-3 rounded-xl border border-border-light p-4">
          {more.length === 0 ? (
            <p className="text-sm text-text-secondary">{localize('com_survey_no_extra')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {more.map((item) => {
                const average =
                  item.key === 'agentsUsed' && comparison.averages
                    ? comparison.averages.agentsUsedOwn + comparison.averages.agentsUsedOthers
                    : comparison.averages?.[item.usageKey];
                const scale = Math.max(item.value, average ?? 0, 1);
                return (
                  <li key={item.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-text-secondary">
                        {localize(surveyKey('card', item.key))}
                      </span>
                      <span className="font-medium text-text-primary">{format(item.value)}</span>
                    </div>
                    <span className="relative mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                      <span
                        className="block h-full rounded-full bg-surface-highlight"
                        style={{ width: `${(item.value / scale) * 100}%` }}
                      />
                      {average !== undefined && (
                        <span
                          className="absolute top-0 h-full w-0.5 bg-text-secondary"
                          style={{ left: `${(average / scale) * 100}%` }}
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {tips.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary">
                {localize('com_survey_try_next')}
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {tips.map((tip) => (
                  <li key={tip.id} className="text-sm text-text-primary">
                    {localize(surveyKey('tip', tip.id))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {!comparison.averages && (
        <div className="flex flex-col gap-2">
          <p className="text-center text-sm text-text-secondary">
            {localize('com_survey_progress_answers', {
              0: String(comparison.responses),
              1: String(comparison.threshold),
            })}
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-tertiary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={comparison.threshold}
            aria-valuenow={comparison.responses}
          >
            <div
              className="h-full rounded-full bg-surface-highlight"
              style={{
                width: `${Math.min(100, (comparison.responses / comparison.threshold) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed left-[-12000px] top-0" aria-hidden="true">
        <Card
          ref={cardRef}
          mark={localize('com_survey_mark')}
          title={title}
          period={period}
          hours={hoursLabel}
          stats={shareStats}
          toolsLabel={localize('com_survey_top_tools')}
          tools={top.slice(0, 3).map((tool) => ({
            name: formatToolName(tool.name),
            width: busiest === 0 ? 0 : (tool.calls / busiest) * 100,
          }))}
          emptyTools={localize('com_survey_no_tools')}
          footer={localize('com_survey_share_footer')}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={state === 'preparing'} onClick={() => void share()}>
            <Share2 className="mr-2 size-4" aria-hidden="true" />
            {localize(state === 'preparing' ? 'com_survey_share_preparing' : 'com_survey_share')}
          </Button>
          {state === 'done' && (
            <span role="status" className="text-sm text-text-secondary">
              {localize('com_survey_share_done')}
            </span>
          )}
          {state === 'error' && (
            <span role="alert" className="text-sm text-text-destructive">
              {localize('com_survey_share_error')}
            </span>
          )}
        </div>
        <Button variant="submit" onClick={onClose}>
          {localize('com_survey_done')}
        </Button>
      </div>
    </div>
  );
}
