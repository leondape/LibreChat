import { cn } from '@librechat/client';
import type { TSurveyBin } from 'librechat-data-provider';
import { binIndex, binPosition, showAhead } from '../stats';
import useFormatNumber from '../format';
import { useLocalize } from '~/hooks';
import { useGrown } from './motion';

const MIN_HEIGHT = 3;

type HistogramProps = {
  title: string;
  axis: string;
  bins: readonly TSurveyBin[];
  median: number;
  you: number;
  ahead?: number;
};

/** How colleagues are spread over a range, with the person's bar and the typical colleague marked. */
export default function Histogram({ title, axis, bins, median, you, ahead }: HistogramProps) {
  const localize = useLocalize();
  const format = useFormatNumber();
  const grown = useGrown();
  const peak = Math.max(1, ...bins.map((bin) => bin.share));
  const mine = binIndex(bins, you);
  const last = bins[bins.length - 1];
  const range = (bin: TSurveyBin) =>
    bin.to === undefined
      ? localize('com_survey_res_range_open', { 0: format(bin.from) })
      : localize('com_survey_res_range', { 0: format(bin.from), 1: format(bin.to) });

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-border-light p-3.5">
      <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      <div
        role="img"
        aria-label={localize('com_survey_res_aria_histogram', {
          0: title,
          1: format(you),
          2: format(median),
        })}
        className="relative h-28"
      >
        <div className="absolute inset-x-0 bottom-0 top-9 flex items-end gap-0.5 border-b border-border-medium">
          {bins.map((bin, index) => (
            <div
              key={bin.from}
              title={localize('com_survey_res_bin_share', { 0: range(bin), 1: bin.share })}
              className={cn(
                'relative min-w-0 flex-1 rounded-t-[3px] transition-[height] duration-700 ease-out motion-reduce:transition-none',
                index === mine ? 'bg-surface-highlight' : 'bg-border-medium',
              )}
              style={{
                height: grown ? `max(${MIN_HEIGHT}px, ${(bin.share / peak) * 100}%)` : MIN_HEIGHT,
              }}
            >
              {index === mine && (
                <span className="absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2 bg-surface-dialog px-0.5 text-[11px] font-semibold text-text-primary">
                  {localize('com_survey_res_you')}
                </span>
              )}
            </div>
          ))}
        </div>
        <div
          className="absolute bottom-0 top-3 border-l-[1.5px] border-dashed border-text-secondary"
          style={{ left: `${binPosition(bins, median) * 100}%` }}
        />
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-secondary"
          style={{ left: `${binPosition(bins, median) * 100}%` }}
        >
          {localize('com_survey_res_typical')}
        </span>
      </div>
      <div className="flex justify-between text-xs text-text-secondary" aria-hidden="true">
        <span>{range(bins[0])}</span>
        <span>{range(last)}</span>
      </div>
      <p className="text-center text-xs text-text-secondary">{axis}</p>
      <p className="text-xs text-text-secondary">
        {localize('com_survey_res_you_typical', { 0: format(you), 1: format(median) })}
      </p>
      {showAhead(ahead) && (
        <p className="text-xs font-semibold text-text-primary">
          {localize('com_survey_ahead', { 0: String(ahead) })}
        </p>
      )}
    </section>
  );
}
