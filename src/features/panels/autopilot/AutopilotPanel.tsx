import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { Annunciator } from '@/features/panels/autopilot/Annunciator';
import { OVERRIDE_NOTICE, SELECTORS, autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { EngageRow } from '@/features/panels/autopilot/EngageRow';
import { ModeButtons } from '@/features/panels/autopilot/ModeButtons';
import { SelectorPad } from '@/features/panels/autopilot/SelectorPad';
import { SelectorRow } from '@/features/panels/autopilot/SelectorRow';
import { useSelectorEntry } from '@/features/panels/autopilot/useSelectorEntry';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useTheme } from '@/theme/theme-context';

export { AUTOPILOT_PANEL } from '@/features/panels/autopilot/autopilot';

/**
 * F-20. Keyed by the aircraft, so a change of aircraft drops every draft and read-back sentence
 * instead of carrying them onto an autopilot they were never meant for.
 */
export function AutopilotPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <AutopilotContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function AutopilotContent() {
  const theme = useTheme();
  const { snapshot } = usePanel();
  const readBack = useReadBack();
  const entry = useSelectorEntry();
  const window = useWindowDimensions();
  // Until the first layout pass, assume the frame's padding; tests never run a layout pass.
  const [measured, setMeasured] = useState<number | null>(null);
  const contentWidth = measured ?? window.width - theme.spacing.lg * 2;
  const wide = contentWidth >= TWO_COLUMN_MIN_WIDTH;
  // R10: never written, only obeyed. A missing binding reads as no override.
  const blocked = autopilotNumber(snapshot, D.autopilotOverride) === 1;
  return (
    <View
      testID="autopilot-columns"
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={{
        flexDirection: wide ? 'row' : 'column',
        gap: theme.touch.spacing,
        alignItems: 'flex-start',
      }}
    >
      <View style={[{ gap: theme.touch.spacing }, wide ? { flex: 1 } : { alignSelf: 'stretch' }]}>
        <Annunciator />
        {blocked ? <BodyText tone="danger">{OVERRIDE_NOTICE}</BodyText> : null}
        <EngageRow readBack={readBack} blocked={blocked} />
        <ModeButtons readBack={readBack} blocked={blocked} />
      </View>
      <View style={wide ? { flex: 1 } : { alignSelf: 'stretch' }}>
        {SELECTORS.map((spec) => (
          <SelectorRow
            key={spec.id}
            spec={spec}
            readBack={readBack}
            blocked={blocked}
            onEnter={() => entry.open(spec.id)}
            entry={
              entry.target?.spec.id === spec.id ? (
                <SelectorPad entry={entry} readBack={readBack} blocked={blocked} />
              ) : null
            }
          />
        ))}
      </View>
    </View>
  );
}
