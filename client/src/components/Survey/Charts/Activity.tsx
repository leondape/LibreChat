import { useMemo } from 'react';
import { cn } from '@librechat/client';
import type { TSurveyDay } from 'librechat-data-provider';
import useFormatNumber from '../format';
import { useLocalize } from '~/hooks';
import { busiestDay } from '../stats';
import { useGrown } from './motion';

const MIN_HEIGHT = 3;

/** One bar per day of messages, with the busiest day labelled. */
export default function Activity({ days }: { days: readonly TSurveyDay[] }) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const grown = useGrown();
  const dates = useMemo(
    () => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [],
  );
  const dateOf = (day: string) => dates.format(new Date(`${day}T00:00:00Z`));
  const peak = busiestDay(days);
  if (!peak || days.length === 0) {
    return null;
  }
  const ends = [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]];

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={localize('com_survey_res_aria_activity', {
          0: dateOf(peak.date),
          1: format(peak.messages),
        })}
        className="flex h-36 items-end gap-[3px] border-b border-border-medium pt-5"
      >
        {days.map((day) => {
          const active = day.messages > 0;
          const isPeak = day.date === peak.date;
          return (
            <div
              key={day.date}
              title={localize('com_survey_res_day_messages', {
                0: dateOf(day.date),
                1: format(day.messages),
              })}
              className={cn(
                'relative min-w-0 flex-1 rounded-t-[3px] transition-[height] duration-700 ease-out motion-reduce:transition-none',
                active ? 'bg-surface-highlight' : 'bg-surface-tertiary',
                active && !isPeak && 'opacity-60',
              )}
              style={{
                height: grown
                  ? `max(${MIN_HEIGHT}px, ${(day.messages / peak.messages) * 100}%)`
                  : MIN_HEIGHT,
              }}
            >
              {isPeak && (
                <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-text-primary">
                  {format(day.messages)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-text-secondary" aria-hidden="true">
        {ends.map((day, index) => (
          <span key={index}>{dateOf(day.date)}</span>
        ))}
      </div>
    </div>
  );
}
