import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { SwitchSpec } from '@/domain/systems/controls';
import { switchNotTaken } from '@/domain/systems/messages';
import { switchOn } from '@/domain/systems/readouts';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  presence,
  sentenceCase,
  valueOf,
} from '@/features/panels/systems/availability';

/**
 * A two-position switch (spec §4.2, §4.6): the light bar shows what X-Plane reports, and a press
 * sends the explicit command for the other position (S2), never a toggle. A second tap waits for
 * X-Plane's answer: the key is invalid while its read-back is pending. Not drawn without a state
 * (S3); the unit around it prints its read-back sentence.
 */
export function SwitchKey({
  spec,
  readBack,
  style,
}: {
  spec: SwitchSpec;
  readBack: ReadBack;
  style?: StyleProp<ViewStyle>;
}) {
  const { snapshot, activate } = usePanel();
  const { shown, enabled } = presence(snapshot, spec.state, [spec.on, spec.off]);
  if (!shown) {
    return null;
  }
  const on = switchOn(valueOf(snapshot, spec.state), spec.index);
  const target = on === true ? spec.off : spec.on;
  const aircraft = aircraftName(snapshot);
  const spoken = on === null ? 'unknown' : on ? 'on' : 'off';

  return (
    <View testID={`switch-${spec.key}`} style={style}>
      <ControlButton
        label={spec.legend}
        accessibilityLabel={`${sentenceCase(spec.name)}, ${spoken}`}
        annunciation={on === true ? 'engaged' : 'off'}
        featureId={spec.featureId}
        target={target}
        confirm={spec.confirmOff === true && on === true}
        invalid={!enabled || on === null || readBack.pendingExpected(spec.key) !== null}
        onPress={() => {
          if (on === null) {
            return;
          }
          void activate(spec.featureId, target);
          readBack.watch({
            key: spec.key,
            name: spec.state,
            operation: target,
            expected: on ? 0 : 1,
            matches: (value) => switchOn(value, spec.index) === !on,
            failure: (value) =>
              switchNotTaken(aircraft, spec.name, !on, switchOn(value, spec.index)),
          });
        }}
      />
    </View>
  );
}
