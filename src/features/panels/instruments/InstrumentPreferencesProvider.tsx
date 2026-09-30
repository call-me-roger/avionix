import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  loadInstrumentPreferences,
  saveInstrumentPreferences,
} from '@/application/instrument-preferences';
import type { SettingsStorage } from '@/application/settings-store';
import type { AircraftIdentity } from '@/domain/aircraft/aircraft-identity';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  type Presentation,
  type PresentationPreferences,
  aircraftKey,
  choosePresentation,
  resolvePresentation,
} from '@/domain/instruments/presentation';

interface InstrumentPreferencesValue {
  preferences: PresentationPreferences;
  choose: (key: string | null, presentation: Presentation) => void;
  ready: boolean;
}

const InstrumentPreferencesContext = createContext<InstrumentPreferencesValue | null>(null);

/**
 * The presentation choice (F-10 R3), per aircraft type. Same load rule as the units and the panel
 * layout: a real choice made before the stored value arrives wins over it.
 */
export function InstrumentPreferencesProvider({
  storage,
  children,
}: {
  storage: SettingsStorage;
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<PresentationPreferences>(
    DEFAULT_PRESENTATION_PREFERENCES,
  );
  const [ready, setReady] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadInstrumentPreferences(storage).then((stored) => {
      if (cancelled) {
        return;
      }
      // Decided in the updater, as in UnitsProvider: a choice queued before this still wins.
      setPreferences((prev) => (touched.current ? prev : stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const choose = useCallback(
    (key: string | null, presentation: Presentation) => {
      setPreferences((prev) => {
        const next = choosePresentation(prev, key, presentation);
        // Only a real change wins over the stored preferences: a no-op must not discard them.
        if (next === prev) {
          return prev;
        }
        touched.current = true;
        // Saved from the updater, in step with the state it came from (see UnitsProvider).
        void saveInstrumentPreferences(storage, next);
        return next;
      });
    },
    [storage],
  );

  const value = useMemo(() => ({ preferences, choose, ready }), [preferences, choose, ready]);
  return (
    <InstrumentPreferencesContext.Provider value={value}>
      {children}
    </InstrumentPreferencesContext.Provider>
  );
}

export function useInstrumentPreferences(): InstrumentPreferencesValue {
  const value = useContext(InstrumentPreferencesContext);
  if (value === null) {
    throw new Error('useInstrumentPreferences must be used inside InstrumentPreferencesProvider');
  }
  return value;
}

/** Re-resolved on every render, so an aircraft or engine-type change applies without a restart. */
export function usePresentation(
  identity: AircraftIdentity,
  engineType: number | null,
): { presentation: Presentation; choose: (presentation: Presentation) => void } {
  const { preferences, choose } = useInstrumentPreferences();
  const key = aircraftKey(identity);
  return {
    presentation: resolvePresentation(preferences, key, engineType),
    choose: (presentation) => choose(key, presentation),
  };
}
