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
import { loadUnitPreferences, saveUnitPreferences } from '@/application/unit-preferences';
import { DEFAULT_UNITS, type UnitPreferences } from '@/domain/units/units';

interface UnitsContextValue {
  units: UnitPreferences;
  setUnit: <K extends keyof UnitPreferences>(kind: K, value: UnitPreferences[K]) => void;
  ready: boolean;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

/**
 * The unit choice every numeric view reads (F-11 R2; F-13 and F-14 later). Same load rule as the
 * panel layout: a real change made before the stored value arrives wins over it.
 */
export function UnitsProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [units, setUnits] = useState<UnitPreferences>(DEFAULT_UNITS);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadUnitPreferences(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      // Decided in the updater, which React runs after any change queued before it, so a change
      // whose updater has not run yet (and so has not marked `touched`) still wins.
      setUnits((prev) => (touched.current ? prev : stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setUnit = useCallback(
    <K extends keyof UnitPreferences>(kind: K, value: UnitPreferences[K]) => {
      setUnits((prev) => {
        if (prev[kind] === value) {
          return prev;
        }
        // Only a real change wins over the stored preferences: a no-op must not discard them.
        touched.current = true;
        const next = { ...prev, [kind]: value };
        // Saving from the updater keeps the write in step with the state it came from; a double
        // invocation under StrictMode writes the same value twice, which is harmless.
        void saveUnitPreferences(storage, next);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ units, setUnit, ready }), [units, setUnit, ready]);
  return <UnitsContext.Provider value={value}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsContextValue {
  const value = useContext(UnitsContext);
  if (value === null) {
    throw new Error('useUnits must be used inside UnitsProvider');
  }
  return value;
}
