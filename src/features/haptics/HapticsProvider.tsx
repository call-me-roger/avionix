import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import {
  loadHapticsPreference,
  saveHapticsPreference,
} from '@/features/haptics/haptics-preference';
import { haptics } from '@/platform/haptics';

interface HapticsContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const HapticsContext = createContext<HapticsContextValue | null>(null);

/**
 * The haptics on/off choice (R-01). Same load rule as the theme and unit preferences: a real
 * change made before the stored value arrives wins over it.
 */
export function HapticsProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [enabled, setEnabledState] = useState(true);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadHapticsPreference(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setEnabledState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setEnabled = useCallback(
    (next: boolean) => {
      touched.current = true;
      setEnabledState(next);
      void saveHapticsPreference(storage, next);
    },
    [storage],
  );

  const value = useMemo<HapticsContextValue>(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled],
  );

  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHapticsPreference(): HapticsContextValue {
  const value = useContext(HapticsContext);
  if (value === null) {
    throw new Error('useHapticsPreference must be used inside HapticsProvider');
  }
  return value;
}

/**
 * A light tick on every key, an error buzz when X-Plane refuses, unless the pilot turned it off.
 * Works without a provider: enabled defaults to true, same as a never-loaded preference would.
 */
export function useHaptics(): { press: () => void; failure: () => void } {
  const value = useContext(HapticsContext);
  const enabled = value === null ? true : value.enabled;
  return useMemo(
    () => ({
      press: () => {
        if (enabled) {
          haptics.press();
        }
      },
      failure: () => {
        if (enabled) {
          haptics.failure();
        }
      },
    }),
    [enabled],
  );
}
