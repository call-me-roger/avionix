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
  DEFAULT_MAP_PREFERENCE,
  type MapPreference,
  loadMapPreference,
  saveMapPreference,
} from '@/features/panels/map/map-preference';

type MapPreferenceValue = [MapPreference, (next: MapPreference) => void];

const MapPreferenceContext = createContext<MapPreferenceValue | null>(null);

/** The remembered orientation and range. A change made before the stored value loads wins. */
export function MapPreferenceProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [preference, setPreferenceState] = useState<MapPreference>(DEFAULT_MAP_PREFERENCE);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadMapPreference(storage).then((stored) => {
      if (!cancelled && !touched.current) {
        setPreferenceState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const setPreference = useCallback(
    (next: MapPreference) => {
      touched.current = true;
      setPreferenceState(next);
      void saveMapPreference(storage, next);
    },
    [storage],
  );

  const value = useMemo<MapPreferenceValue>(
    () => [preference, setPreference],
    [preference, setPreference],
  );
  return <MapPreferenceContext.Provider value={value}>{children}</MapPreferenceContext.Provider>;
}

/** The remembered settings and their setter; without a provider (the guards), local state. */
export function useMapPreference(): MapPreferenceValue {
  const value = useContext(MapPreferenceContext);
  const [local, setLocal] = useState<MapPreference>(DEFAULT_MAP_PREFERENCE);
  return value ?? [local, setLocal];
}
