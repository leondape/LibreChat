import { cn } from '@librechat/client';
import { useLocalize } from '~/hooks';

type PeopleProps = {
  /** A percentage; shown as the nearest tenth of ten people. */
  percent: number;
  label: string;
  detail?: string;
};

function Person({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 18 28"
      className={cn('h-6 w-4', filled ? 'text-scale-positive' : 'text-surface-tertiary')}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="5" />
      <path d="M1 27 V18 a8 8 0 0 1 16 0 V27 Z" />
    </svg>
  );
}

/** "8 in 10" as ten little people, so the share reads without any arithmetic. */
export default function People({ percent, label, detail }: PeopleProps) {
  const localize = useLocalize();
  const filled = Math.round(percent / 10);
  const count = localize('com_survey_res_in_ten', { 0: filled });
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`${count} ${label}`} className="flex gap-1">
        {Array.from({ length: 10 }, (_, index) => (
          <Person key={index} filled={index < filled} />
        ))}
      </div>
      <p className="text-sm text-text-primary">
        <span className="font-semibold">{count}</span> {label}
      </p>
      {detail && <p className="text-xs text-text-secondary">{detail}</p>}
    </div>
  );
}
