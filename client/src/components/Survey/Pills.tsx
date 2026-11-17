import { useRef } from 'react';
import { cn } from '@librechat/client';
import type { SurveyTone } from './spectrum';

export type PillOption = { value: string; label: string; tone?: SurveyTone; aside?: boolean };

type PillsProps = {
  options: readonly PillOption[];
  value: readonly string[];
  onToggle: (value: string) => void;
  labelledBy: string;
  /** Several pills can be on at once; otherwise the group is a single choice. */
  multiple?: boolean;
  isDisabled?: (value: string) => boolean;
  /** Keeps every option on one line. The row scrolls when it does not fit. */
  nowrap?: boolean;
  className?: string;
};

const base =
  'inline-flex min-h-9 shrink-0 items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary disabled:cursor-not-allowed disabled:opacity-50';
const on = 'border-transparent bg-surface-inverted text-text-inverted';
const off = 'border-border-medium bg-transparent text-text-primary hover:bg-surface-hover';

const toneOn: Record<SurveyTone, string> = {
  negative: 'border-transparent bg-scale-negative text-text-on-highlight',
  'negative-soft': 'border-transparent bg-scale-negative-soft text-text-primary',
  neutral: 'border-transparent bg-scale-neutral text-text-on-highlight',
  'positive-soft': 'border-transparent bg-scale-positive-soft text-text-primary',
  positive: 'border-transparent bg-scale-positive text-text-on-highlight',
};

const toneOff: Record<SurveyTone, string> = {
  negative: 'border-scale-negative/40 bg-scale-negative/10 text-scale-negative',
  'negative-soft': 'border-scale-negative/30 bg-scale-negative-soft text-text-primary',
  neutral: 'border-scale-neutral/40 bg-scale-neutral/10 text-text-primary',
  'positive-soft': 'border-scale-positive/30 bg-scale-positive-soft text-text-primary',
  positive: 'border-scale-positive/40 bg-scale-positive/10 text-scale-positive',
};

function pillTone(tone: SurveyTone | undefined, checked: boolean): string {
  if (tone == null) {
    return checked ? on : off;
  }
  return checked ? toneOn[tone] : toneOff[tone];
}

export default function Pills({
  options,
  value,
  onToggle,
  labelledBy,
  multiple = false,
  isDisabled,
  nowrap = false,
  className,
}: PillsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = options.findIndex((option) => value.includes(option.value));

  /** A single choice is one tab stop and the arrows move the selection, like a radio group. */
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (multiple) {
      return;
    }
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
    };
    const target = moves[event.key];
    if (target == null) {
      return;
    }
    event.preventDefault();
    const next = (target + options.length) % options.length;
    refs.current[next]?.focus();
    if (!value.includes(options[next].value)) {
      onToggle(options[next].value);
    }
  };

  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-labelledby={labelledBy}
      className={cn('flex items-center gap-2', nowrap ? 'flex-nowrap' : 'flex-wrap', className)}
    >
      {options.flatMap((option, index) => {
        const checked = value.includes(option.value);
        const disabled = !checked && isDisabled?.(option.value) === true;
        const previous = options[index - 1];
        const divider = option.aside === true && previous?.aside !== true;
        const button = (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role={multiple ? undefined : 'radio'}
            aria-checked={multiple ? undefined : checked}
            aria-pressed={multiple ? checked : undefined}
            tabIndex={multiple || checked || (checkedIndex < 0 && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onToggle(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(base, pillTone(option.tone, checked))}
          >
            {option.label}
          </button>
        );
        if (!divider) {
          return [button];
        }
        return [
          <span
            key={`${option.value}-divider`}
            aria-hidden="true"
            className="mx-1 h-6 w-px shrink-0 bg-border-medium"
          />,
          button,
        ];
      })}
    </div>
  );
}
