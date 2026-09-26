import { useEffect } from 'react';

import { holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';

/** Holds the screen awake while `hold` is true; releasing on false and on unmount. */
export function useScreenKeepAwake(hold: boolean): void {
  useEffect(() => {
    if (!hold) {
      return;
    }
    void holdScreenAwake();
    return () => {
      void releaseScreenAwake();
    };
  }, [hold]);
}
