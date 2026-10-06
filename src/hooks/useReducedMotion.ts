import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The OS "reduce motion" setting, read once and then followed. False until it is known, and when
 * the platform cannot say: a flash that should have been steady is brief, never a lost warning.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // A change event is newer than the first read, so a late first read must not undo it.
    let settled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (!settled) {
          setReduced(enabled);
        }
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      settled = true;
      setReduced(enabled);
    });
    return () => {
      settled = true;
      // react-native-web returns nothing where the browser has no matchMedia, despite the type.
      subscription?.remove();
    };
  }, []);

  return reduced;
}
