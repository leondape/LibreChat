import { useRef } from 'react';
import { cn } from '@librechat/client';

export type PillOption = { value: string; label: string };

type PillsProps = {
  options: readonly PillOption[];
  value: readonly string[];
  onToggle: (value: string) => void;
  labelledBy: string;
  /** Several pills can be on at once; otherwise the group is a single choice. */
  multiple?: boolean;
  isDisabled?: (value: string) => boolean;
  className?: string;
};

const base =
  'inline-flex min-h-9 items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary disabled:cursor-not-allowed disabled:opacity-50';
const on = 'border-transparent bg-surface-inverted text-text-inverted';
const off = 'border-border-medium bg-transparent text-text-primary hover:bg-surface-hover';

export default function Pills({
  options,
  value,
  onToggle,
  labelledBy,
  multiple = false,
  isDisabled,
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
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option, index) => {
        const checked = value.includes(option.value);
        const disabled = !checked && isDisabled?.(option.value) === true;
        return (
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
            className={cn(base, checked ? on : off)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
