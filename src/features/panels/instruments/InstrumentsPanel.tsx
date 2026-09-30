import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import {
  FEATURE_ALTIMETER_SETTING,
  FEATURE_FLIGHT_INSTRUMENTS,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { pfdWidth } from '@/domain/instruments/geometry';
import type { Presentation } from '@/domain/instruments/presentation';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { BaroControls } from '@/features/panels/instruments/BaroControls';
import { usePresentation } from '@/features/panels/instruments/InstrumentPreferencesProvider';
import { PfdView } from '@/features/panels/instruments/pfd/PfdView';
import { SixPackView } from '@/features/panels/instruments/six-pack/SixPackView';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { RadioChips, type RadioChipOption } from '@/theme/RadioChips';
import { useTheme } from '@/theme/theme-context';

export const INSTRUMENTS_PANEL: PanelDescriptor = {
  id: 'instruments',
  title: 'Instruments',
  features: [FEATURE_FLIGHT_INSTRUMENTS, FEATURE_ALTIMETER_SETTING],
  supports: EVERYWHERE,
};

const PRESENTATION_OPTIONS: readonly RadioChipOption<Presentation>[] = [
  { value: 'pfd', label: 'PFD', accessibilityLabel: 'Primary flight display' },
  { value: 'sixPack', label: 'Six-pack', accessibilityLabel: 'Six-pack gauges' },
];

/**
 * F-10. Read-only except the altimeter setting (R12). One tap switches presentation — never a
 * swipe, which competitors' users report flipping by accident. With no flight loaded the cached
 * engine type still applies, so unloading a flight never flips the presentation.
 */
export function InstrumentsPanel() {
  const theme = useTheme();
  const { snapshot } = usePanel();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const engineType = firstNumber(snapshot.telemetry[D.engineType]?.value);
  const { presentation, choose } = usePresentation(snapshot.compatibility.identity, engineType);
  return (
    <>
      <RadioChips
        options={PRESENTATION_OPTIONS}
        selected={presentation}
        onSelect={choose}
        accessibilityLabel="Instrument presentation"
      />
      <View
        style={{ alignItems: 'center' }}
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      >
        {presentation === 'pfd' ? (
          <PfdView width={pfdWidth(contentWidth, window.height)} />
        ) : (
          <SixPackView
            contentWidth={contentWidth}
            windowHeight={window.height}
            landscape={window.width > window.height}
          />
        )}
      </View>
      <BaroControls />
    </>
  );
}
