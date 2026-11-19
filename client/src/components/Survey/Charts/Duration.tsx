import { cn } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGrown } from './motion';
import Tag from './Tag';

type DurationProps = {
  title: string;
  without: number;
  with: number;
  /** Minutes that fill the whole bar, shared by every pair on the page. */
  max: number;
  yours?: boolean;
};

/** How long one pass of a task takes without WanGPT and with it. */
export default function Duration({ title, without, with: withTool, max, yours }: DurationProps) {
  const localize = useLocalize();
  const grown = useGrown();
  const rows = [
    { key: 'without', label: localize('com_survey_res_without'), minutes: without },
    { key: 'with', label: localize('com_survey_res_with'), minutes: withTool },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        {title}
        {yours && <Tag />}
      </p>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2.5 text-xs text-text-secondary"
        >
          <span className="truncate">{row.label}</span>
          <span className="h-3.5 overflow-hidden rounded bg-surface-tertiary">
            <span
              className={cn(
                'block h-full rounded transition-[width] duration-700 ease-out motion-reduce:transition-none',
                yours && row.key === 'with' ? 'bg-surface-highlight' : 'bg-border-medium',
              )}
              style={{ width: grown ? `${Math.min(100, (row.minutes / max) * 100)}%` : 0 }}
            />
          </span>
          <span className="text-right text-text-primary">
            {localize('com_survey_res_minutes', { 0: row.minutes })}
          </span>
        </div>
      ))}
    </div>
  );
}
