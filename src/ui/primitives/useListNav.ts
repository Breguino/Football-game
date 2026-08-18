import { useCallback, useEffect, useState } from 'react';
import type { NavAction } from '@/input/actions';

/**
 * Cursor state for a vertical list, skipping disabled entries and clamping at
 * the ends (menus here do not wrap — FC's don't either, and wrapping makes
 * long settings lists feel slippery).
 */
export function useListNav(length: number, isDisabled?: (index: number) => boolean) {
  const [index, setIndex] = useState(0);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => {
        let next = current;
        for (let i = 0; i < length; i += 1) {
          const candidate = next + delta;
          if (candidate < 0 || candidate >= length) return next;
          next = candidate;
          if (!isDisabled?.(next)) return next;
        }
        return next;
      });
    },
    [length, isDisabled],
  );

  // Keep the cursor in range when the list shrinks under it.
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, length - 1)));
  }, [length]);

  const handle = useCallback(
    (action: NavAction) => {
      if (action === 'up') step(-1);
      else if (action === 'down') step(1);
    },
    [step],
  );

  return { index, setIndex, handle, step };
}
