import { useEffect, useState } from 'react';
import { reducedMotion } from '../Charts/motion';

/** Counts up to `value` over a moment, or shows it straight away with reduced motion. */
export default function CountUp({
  value,
  format,
}: {
  value: number;
  format: (value: number) => string;
}) {
  const whole = Number.isInteger(value);
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setShown(value * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(whole ? Math.round(shown) : shown)}</>;
}
