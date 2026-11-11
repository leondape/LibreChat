import type { ReactNode } from 'react';
import { cn } from '~/utils';

/** Comic speech bubble. The border uses theme tokens so it follows light and dark. */
export default function Bubble({
  children,
  size,
  id,
  tail,
}: {
  children: ReactNode;
  size: 'sm' | 'lg';
  id?: string;
  /** Where the tail points, in pixels from the bubble's left edge. Centered when omitted. */
  tail?: number;
}) {
  return (
    <div
      id={id}
      className={cn(
        'relative z-10 border-2 border-border-heavy bg-surface-primary text-left text-text-primary shadow-[3px_3px_0_0_rgb(var(--border-heavy)/var(--border-heavy-alpha,1))]',
        size === 'sm'
          ? 'w-max max-w-[16rem] px-3 py-2 text-sm'
          : 'w-[min(22rem,calc(100vw-3rem))] px-4 py-3 text-sm',
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-border-heavy bg-surface-primary"
        style={tail == null ? undefined : { left: tail }}
      />
    </div>
  );
}
