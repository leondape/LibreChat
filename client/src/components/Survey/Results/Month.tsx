import { Bot, CalendarDays, MessageSquare, Wrench } from 'lucide-react';
import type { TSurveyResult } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import { busiestDay, longestStreak, weekdayTotals } from '../stats';
import Weekdays from '../Charts/Weekdays';
import Activity from '../Charts/Activity';
import { formatToolName } from '../tools';
import useFormatNumber from '../format';
import { useLocalize } from '~/hooks';
import { surveyKey } from '../Step';
import Bars from '../Charts/Bars';
import CountUp from './CountUp';

type Headline = { key: string; icon: LucideIcon; value: number };

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

/** The person's own month: the headline numbers, the days, the tools. */
export default function Month({ result }: { result: TSurveyResult }) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const { usage, activity } = result;
  const headlines: Headline[] = [
    { key: 'messages', icon: MessageSquare, value: usage.messagesSent },
    { key: 'activeDays', icon: CalendarDays, value: usage.activeDays },
    { key: 'toolCalls', icon: Wrench, value: usage.toolCalls },
    { key: 'agents', icon: Bot, value: usage.agentsOwned },
  ];
  const peak = busiestDay(activity);
  const tools = usage.topTools ?? [];
  const tip = TIPS.find((item) => item.when(result));
  const dates = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const range = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const dateOf = (formatter: Intl.DateTimeFormat, day: string) =>
    formatter.format(new Date(`${day}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {headlines.map((item) => {
          const Icon = item.icon;
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
            </li>
          );
        })}
      </ul>

      {peak ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-2">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                {localize('com_survey_res_messages_day')}
              </h4>
              <p className="text-xs text-text-secondary">
                {localize('com_survey_res_month_caption', {
                  0: dateOf(range, activity[0].date),
                  1: dateOf(range, activity[activity.length - 1].date),
                  2: usage.activeDays,
                })}
              </p>
            </div>
            <Activity days={activity} />
          </section>
          <section className="flex flex-col gap-3 rounded-xl border border-border-light bg-surface-secondary p-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-text-secondary">
                  {localize('com_survey_res_busiest')}
                </dt>
                <dd className="text-sm font-semibold text-text-primary">
                  {dateOf(dates, peak.date)}
                </dd>
                <dd className="text-xs text-text-secondary">
                  {localize('com_survey_res_busiest_detail', { 0: format(peak.messages) })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">{localize('com_survey_res_streak')}</dt>
                <dd className="text-sm font-semibold text-text-primary">
                  {format(longestStreak(activity))}
                </dd>
                <dd className="text-xs text-text-secondary">
                  {localize('com_survey_res_streak_detail')}
                </dd>
              </div>
            </dl>
            <Weekdays totals={weekdayTotals(activity)} />
          </section>
        </div>
      ) : (
        <p className="rounded-xl border border-border-light p-4 text-sm text-text-secondary">
          {localize('com_survey_res_no_activity')}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-2">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">
              {localize('com_survey_top_tools')}
            </h4>
            <p className="text-xs text-text-secondary">
              {localize('com_survey_res_tools_caption', { 0: usage.windowDays })}
            </p>
          </div>
          {tools.length === 0 ? (
            <p className="text-sm text-text-secondary">{localize('com_survey_no_tools')}</p>
          ) : (
            <Bars
              label={localize('com_survey_top_tools')}
              rows={tools.map((tool) => ({
                key: tool.name,
                label: formatToolName(tool.name),
                value: tool.calls,
                display: format(tool.calls),
              }))}
            />
          )}
        </section>
        {tip && (
          <section className="rounded-xl border border-border-light bg-surface-secondary p-3">
            <h4 className="text-xs font-medium text-text-secondary">
              {localize('com_survey_try_next')}
            </h4>
            <p className="mt-1 text-sm text-text-primary">{localize(surveyKey('tip', tip.id))}</p>
          </section>
        )}
      </div>
    </div>
  );
}
