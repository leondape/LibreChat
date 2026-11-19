import { cn } from '@librechat/client';
import { useGrown } from './motion';
import Tag from './Tag';

export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** What is written at the right edge. */
  display: string;
  yours?: boolean;
};

type BarsProps = {
  rows: readonly BarRow[];
  /** The value that fills the whole bar. Defaults to the largest row. */
  max?: number;
  /** Colleagues use the neutral fill and the person the highlight; otherwise everything is the person's. */
  neutral?: boolean;
  label: string;
};

/** Horizontal bars with the label above and the figure at the right edge. */
export default function Bars({ rows, max, neutral = false, label }: BarsProps) {
  const grown = useGrown();
  const scale = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'truncate',
                  row.yours ? 'font-semibold text-text-primary' : 'text-text-primary',
                )}
              >
                {row.label}
              </span>
              {row.yours && <Tag />}
            </span>
            <span className="shrink-0 text-xs text-text-secondary">{row.display}</span>
          </div>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-tertiary">
            <span
              className={cn(
                'block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                !neutral || row.yours ? 'bg-surface-highlight' : 'bg-border-medium',
              )}
              style={{ width: grown ? `${Math.min(100, (row.value / scale) * 100)}%` : 0 }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
