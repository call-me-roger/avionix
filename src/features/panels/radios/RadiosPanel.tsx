import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { EntryPad } from '@/features/panels/radios/EntryPad';
import { RadioRow } from '@/features/panels/radios/RadioRow';
import { RADIOS } from '@/features/panels/radios/radios';
import { TransponderSection } from '@/features/panels/radios/TransponderSection';
import { useRadioEntry } from '@/features/panels/radios/useRadioEntry';
import { useTheme } from '@/theme/theme-context';

export { RADIOS_PANEL } from '@/features/panels/radios/radios';

/**
 * Below this content width, the keypad goes under the radio stack instead of beside it: a phone,
 * even landscape, cannot fit both a readable frequency and a thumb-sized keypad in one column.
 * Tablets and landscape phones keep the keypad beside the stack, so a pilot sees the radio they
 * are tuning while typing.
 */
export const TWO_COLUMN_MIN_WIDTH = 720;

/**
 * F-21/F-22. Keyed by the aircraft, so a change of aircraft drops every draft and read-back
 * sentence instead of carrying them onto radios they were never meant for.
 */
export function RadiosPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <RadiosContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function RadiosContent() {
  const theme = useTheme();
  const readBack = useReadBack();
  const entry = useRadioEntry();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const wide = contentWidth >= TWO_COLUMN_MIN_WIDTH;
  return (
    <View
      testID="radios-columns"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={{
        flexDirection: wide ? 'row' : 'column',
        gap: theme.touch.spacing,
        alignItems: 'flex-start',
      }}
    >
      <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
        {RADIOS.map((radio) => (
          <RadioRow
            key={radio.key}
            radio={radio}
            readBack={readBack}
            onEnterStandby={() => entry.open(radio.key)}
          />
        ))}
        <TransponderSection readBack={readBack} onEnterCode={() => entry.open('squawk')} />
      </View>
      {entry.target === null ? null : (
        <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
          <EntryPad entry={entry} readBack={readBack} />
        </View>
      )}
    </View>
  );
}
