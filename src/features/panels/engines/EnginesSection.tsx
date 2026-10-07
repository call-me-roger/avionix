import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { GAUGES } from '@/domain/engines/catalogue';
import { egtSamples, leanAvailable } from '@/domain/engines/lean';
import {
  ENGINES_NOT_SHOWN,
  engineUnsupported,
  enginesUnidentified,
  gaugesMissing,
  noEngines,
  unitsUnknown,
} from '@/domain/engines/messages';
import { aircraftKey } from '@/domain/instruments/presentation';
import { EngineTable } from '@/features/panels/engines/EngineTable';
import { useLean } from '@/features/panels/engines/EnginesPreferenceProvider';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AVIONICS_UNIT_PADDING, AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { PanelKey } from '@/features/panels/primitives/PanelKey';
import { aircraftName } from '@/features/panels/systems/availability';
import { BodyText } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

/** LEAN (spec §4.6) sits at the end of the unit's label row. */
const LEAN_KEY_STYLE = { marginLeft: 'auto' as const };

/**
 * The ENGINES page (spec §4.2–§4.6): the dials and the gauge table, or the one sentence that says
 * why there are none, then the lines naming what the aircraft does not publish. While lean assist
 * is on, each piston engine's peak EGT advances from an effect as values arrive; the peaks belong
 * to one aircraft, and another aircraft's EGT is never compared with them (Review Focus 4).
 */
export function EnginesSection() {
  const theme = useTheme();
  const window = useWindowDimensions();
  const { snapshot, link } = usePanel();
  const { model } = useEnginesModel();
  const [lean, store] = useLean();
  const aircraft = aircraftKey(snapshot.compatibility.identity);
  const available = leanAvailable(model);
  // Until the first layout pass, assume the window minus the unit's own padding; tests never run a
  // layout pass. The window alone overstates it in landscape, where the switcher rail (and safe-area
  // insets) sit beside the panel, so dials sized from it would overflow.
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    if (lean.on) {
      store.advance(aircraft, egtSamples(model));
    }
  }, [lean.on, store, aircraft, model]);

  const peaks = lean.on && available ? (lean.aircraft === aircraft ? lean.peaks : {}) : null;
  const name = aircraftName(snapshot);
  const fallbackWidth = window.width - 2 * theme.spacing.lg - 2 * AVIONICS_UNIT_PADDING;
  const width = measured ?? fallbackWidth;

  return (
    <AvionicsUnit
      testID="engines-section"
      label="ENGINES"
      labelAccessory={
        available || lean.on ? (
          // LEAN is a local display mode, so a plain key, not a ControlButton; it writes nothing.
          <PanelKey
            testID="engines-lean"
            legend="LEAN"
            accessibilityLabel="Lean assist"
            role="switch"
            checked={lean.on}
            lit={lean.on}
            onPress={() => store.toggle(aircraft)}
            style={LEAN_KEY_STYLE}
          />
        ) : undefined
      }
    >
      {model.status === 'unidentified' ? <BodyText>{enginesUnidentified(name)}</BodyText> : null}
      {model.status === 'none' ? <BodyText>{noEngines(name)}</BodyText> : null}
      {model.status === 'ready' ? (
        <View
          testID="engine-table"
          onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
        >
          <EngineTable model={model} peaks={peaks} stale={!link.valuesCurrent} width={width} />
        </View>
      ) : null}
      {model.unsupported.map((engine) => (
        <BodyText key={engine} muted>
          {engineUnsupported(engine)}
        </BodyText>
      ))}
      {model.hidden > 0 ? <BodyText muted>{ENGINES_NOT_SHOWN}</BodyText> : null}
      {model.missing.length > 0 ? (
        <BodyText muted>{gaugesMissing(name, model.missing)}</BodyText>
      ) : null}
      {model.unknownUnits.length > 0 ? (
        <BodyText muted>
          {unitsUnknown(
            name,
            model.unknownUnits.map((id) => GAUGES[id].spoken),
          )}
        </BodyText>
      ) : null}
    </AvionicsUnit>
  );
}
