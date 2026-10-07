import { useMemo } from 'react';

import { type EngineReader, type EnginesModel, enginesPage } from '@/domain/engines/engine-page';
import { engineReader } from '@/features/panels/engines/engine-reader';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useUnits } from '@/features/units/UnitsProvider';

/** The ENGINES model for the panel's snapshot and the pilot's units, rebuilt when either changes. */
export function useEnginesModel(): { reader: EngineReader; model: EnginesModel } {
  const { snapshot } = usePanel();
  const { units } = useUnits();
  return useMemo(() => {
    const reader = engineReader(snapshot);
    return { reader, model: enginesPage(reader, units) };
  }, [snapshot, units]);
}
