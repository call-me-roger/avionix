import React, { createContext, useContext, useMemo } from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { type EngineReader, type EnginesModel, enginesPage } from '@/domain/engines/engine-page';
import type { UnitPreferences } from '@/domain/units/units';
import { engineReader } from '@/features/panels/engines/engine-reader';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

interface EnginesModelValue {
  reader: EngineReader;
  model: EnginesModel;
}

const EnginesModelContext = createContext<EnginesModelValue | null>(null);

function build(snapshot: SessionSnapshot, units: UnitPreferences): EnginesModelValue {
  const reader = engineReader(snapshot);
  return { reader, model: enginesPage(reader, units) };
}

/**
 * Derives the ENGINES model once per snapshot for every section below it: the wide layout shows
 * three sections, and each would otherwise rebuild it at the telemetry rate.
 */
export function EnginesModelProvider({ children }: { children: React.ReactNode }) {
  const { snapshot } = usePanel();
  const { units } = useUnits();
  const value = useMemo(() => build(snapshot, units), [snapshot, units]);
  return <EnginesModelContext.Provider value={value}>{children}</EnginesModelContext.Provider>;
}

/**
 * The ENGINES model for the panel's snapshot and the pilot's units: the provider's when there is
 * one, else built here (a section rendered on its own), rebuilt when either changes.
 */
export function useEnginesModel(): EnginesModelValue {
  const provided = useContext(EnginesModelContext);
  const { snapshot } = usePanel();
  const { units } = useUnits();
  return useMemo(() => provided ?? build(snapshot, units), [provided, snapshot, units]);
}
