import { useEffect, useState } from 'react';

export function reducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** False for the first frame, then true, so a bar can grow from nothing. Always true with reduced motion. */
export function useGrown() {
  const [grown, setGrown] = useState(reducedMotion);
  useEffect(() => {
    if (grown) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [grown]);
  return grown;
}
