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
import type { CduUnit } from '@/domain/cdu/keys';
import { loadCduPreference, saveCduPreference } from '@/features/panels/cdu/cdu-preference';

type CduUnitValue = [CduUnit, (unit: CduUnit) => void];

const CduPreferenceContext = createContext<CduUnitValue | null>(null);

/**
 * The CDU 1 / CDU 2 choice (spec §4.6). Same load rule as the haptics preference: a real change
 * made before the stored value arrives wins over it.
 */
export function CduPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [unit, setUnitState] = useState<CduUnit>(1);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadCduPreference(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setUnitState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setUnit = useCallback(
    (next: CduUnit) => {
      touched.current = true;
      setUnitState(next);
      void saveCduPreference(storage, next);
    },
    [storage],
  );

  const value = useMemo<CduUnitValue>(() => [unit, setUnit], [unit, setUnit]);

  return <CduPreferenceContext.Provider value={value}>{children}</CduPreferenceContext.Provider>;
}

/**
 * The remembered unit and its setter. Works without a provider (a panel rendered on its own, as
 * the guards do): local state, starting on CDU 1, remembered for as long as the caller is mounted.
 */
export function useCduUnit(): CduUnitValue {
  const value = useContext(CduPreferenceContext);
  const [local, setLocal] = useState<CduUnit>(1);
  return value ?? [local, setLocal];
}
