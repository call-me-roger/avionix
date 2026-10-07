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
import { DEFAULT_SYSTEMS_PAGE, type SystemsPage } from '@/features/panels/systems/systems';
import { loadSystemsPage, saveSystemsPage } from '@/features/panels/systems/systems-preference';

type SystemsPageValue = [SystemsPage, (page: SystemsPage) => void];

const SystemsPreferenceContext = createContext<SystemsPageValue | null>(null);

/**
 * The remembered Systems page (spec §4.7). Same load rule as the CDU unit and haptics preferences:
 * a real change made before the stored value arrives wins over it.
 */
export function SystemsPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [page, setPageState] = useState<SystemsPage>(DEFAULT_SYSTEMS_PAGE);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadSystemsPage(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      if (!touched.current) {
        setPageState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPage = useCallback(
    (next: SystemsPage) => {
      touched.current = true;
      setPageState(next);
      void saveSystemsPage(storage, next);
    },
    [storage],
  );

  const value = useMemo<SystemsPageValue>(() => [page, setPage], [page, setPage]);

  return (
    <SystemsPreferenceContext.Provider value={value}>{children}</SystemsPreferenceContext.Provider>
  );
}

/**
 * The remembered page and its setter. Works without a provider (a panel rendered on its own, as
 * the guards do): local state, starting on FLIGHT, remembered for as long as the caller is mounted.
 */
export function useSystemsPage(): SystemsPageValue {
  const value = useContext(SystemsPreferenceContext);
  const [local, setLocal] = useState<SystemsPage>(DEFAULT_SYSTEMS_PAGE);
  return value ?? [local, setLocal];
}
