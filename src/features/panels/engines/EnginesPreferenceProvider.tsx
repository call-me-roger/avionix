import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import { DEFAULT_ENGINES_PAGE, type EnginesPage } from '@/features/panels/engines/engines';
import { loadEnginesPage, saveEnginesPage } from '@/features/panels/engines/engines-preference';
import { type LeanState, LeanStore } from '@/features/panels/engines/lean-store';

type EnginesPageValue = [EnginesPage, (page: EnginesPage) => void];

const EnginesPageContext = createContext<EnginesPageValue | null>(null);
const LeanStoreContext = createContext<LeanStore | null>(null);

/**
 * The remembered Engines page (spec §4.10) and the session's lean-assist store (§4.6). Same load
 * rule as the Systems page: a real change made before the stored value arrives wins over it.
 */
export function EnginesPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [page, setPageState] = useState<EnginesPage>(DEFAULT_ENGINES_PAGE);
  const [leanStore] = useState(() => new LeanStore());
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadEnginesPage(storage).then((stored) => {
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
    (next: EnginesPage) => {
      touched.current = true;
      setPageState(next);
      void saveEnginesPage(storage, next);
    },
    [storage],
  );

  const value = useMemo<EnginesPageValue>(() => [page, setPage], [page, setPage]);

  return (
    <EnginesPageContext.Provider value={value}>
      <LeanStoreContext.Provider value={leanStore}>{children}</LeanStoreContext.Provider>
    </EnginesPageContext.Provider>
  );
}

/** The remembered page and its setter; without a provider (the guards), local state on ENGINES. */
export function useEnginesPage(): EnginesPageValue {
  const value = useContext(EnginesPageContext);
  const [local, setLocal] = useState<EnginesPage>(DEFAULT_ENGINES_PAGE);
  return value ?? [local, setLocal];
}

/** Lean assist's state and its store; without a provider, a store local to the caller. */
export function useLean(): [LeanState, LeanStore] {
  const shared = useContext(LeanStoreContext);
  const [local] = useState(() => new LeanStore());
  const store = shared ?? local;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return [state, store];
}
