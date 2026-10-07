import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { AudioUnit } from '@/features/panels/radios/AudioUnit';
import { EntryPad } from '@/features/panels/radios/EntryPad';
import { RadioRow } from '@/features/panels/radios/RadioRow';
import { RADIOS } from '@/features/panels/radios/radios';
import { TransponderSection } from '@/features/panels/radios/TransponderSection';
import { useRadioEntry } from '@/features/panels/radios/useRadioEntry';
import { useTheme } from '@/theme/theme-context';

export { RADIOS_PANEL } from '@/features/panels/radios/radios';
export { TWO_COLUMN_MIN_WIDTH };

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
  const pad = entry.target === null ? null : <EntryPad entry={entry} readBack={readBack} />;
  // Wide: the keypad sits beside the stack, where a pilot can see the radio while typing. Narrow
  // (a phone): it opens directly under the row being edited, never after all four rows and the
  // transponder where it would land off-screen (I1).
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
      <View
        style={[{ gap: theme.spacing.md }, wide ? { flex: 1 } : { alignSelf: 'stretch' as const }]}
      >
        <AudioUnit readBack={readBack} />
        {RADIOS.map((radio) => (
          <RadioRow
            key={radio.key}
            radio={radio}
            readBack={readBack}
            onEnterStandby={() => entry.open(radio.key)}
            entry={!wide && entry.target?.id === radio.key ? pad : null}
          />
        ))}
        <TransponderSection
          readBack={readBack}
          onEnterCode={() => entry.open('squawk')}
          entry={!wide && entry.target?.id === 'squawk' ? pad : null}
          squawkEntryOpen={entry.target?.id === 'squawk'}
        />
      </View>
      {wide && pad !== null ? <View style={{ flex: 1 }}>{pad}</View> : null}
    </View>
  );
}
