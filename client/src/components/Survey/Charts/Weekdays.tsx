import { cn } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGrown } from './motion';

/** Monday first, from any Monday. */
const MONDAY = Date.UTC(2024, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_HEIGHT = 3;

/** Seven bars, one per weekday, with the busiest weekday named underneath. */
export default function Weekdays({ totals }: { totals: readonly number[] }) {
  const localize = useLocalize();
  const grown = useGrown();
  const max = Math.max(...totals);
  if (max <= 0) {
    return null;
  }
  const top = totals.indexOf(max);
  const short = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
  const day = (index: number) => new Date(MONDAY + index * DAY_MS);
  const busiest = localize('com_survey_res_weekday_top', { 0: long.format(day(top)) });

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={busiest} className="flex h-14 items-end gap-1.5">
        {totals.map((total, index) => (
          <div
            key={index}
            className={cn(
              'min-w-0 flex-1 rounded-t-[3px] transition-[height] duration-700 ease-out motion-reduce:transition-none',
              index === top ? 'bg-surface-highlight' : 'bg-border-medium',
            )}
            style={{
              height: grown ? `max(${MIN_HEIGHT}px, ${(total / max) * 100}%)` : MIN_HEIGHT,
            }}
          />
        ))}
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {totals.map((_, index) => (
          <span
            key={index}
            className={cn(
              'min-w-0 flex-1 truncate text-center text-[10px]',
              index === top ? 'font-semibold text-text-primary' : 'text-text-secondary',
            )}
          >
            {short.format(day(index))}
          </span>
        ))}
      </div>
      <p className="text-sm text-text-primary">{busiest}</p>
    </div>
  );
}
