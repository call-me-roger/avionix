import React from 'react';
import { Text, View } from 'react-native';

import type { DimmerSpec } from '@/domain/systems/controls';
import { dimmerNotTaken } from '@/domain/systems/messages';
import { brightnessPercent, numberAt } from '@/domain/systems/readouts';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingOk,
  sentenceCase,
  valueOf,
} from '@/features/panels/systems/availability';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.touch.spacing },
  legend: {
    ...avionicsText(theme, true),
    flex: 1,
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
  readout: {
    ...numeric(theme, true),
    minWidth: 56,
    textAlign: 'right' as const,
    fontSize: theme.typography.titleSize,
    color: theme.avionics.legend,
  },
  stale: { color: theme.avionics.legendDim },
});

/**
 * A brightness rheostat (spec §4.6): X-Plane's percentage and its own "a bit" commands. Adopted is
 * any change from the value at the press. Not drawn without a state (S3).
 */
export function DimmerRow({ spec, readBack }: { spec: DimmerSpec; readBack: ReadBack }) {
  const { snapshot, link, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  if (!bindingOk(snapshot, spec.state)) {
    return null;
  }
  const value = numberAt(valueOf(snapshot, spec.state), spec.index);
  const percent = brightnessPercent(value);
  const pending = readBack.pendingExpected(spec.key) !== null;
  const aircraft = aircraftName(snapshot);
  const name = sentenceCase(spec.name);

  const key = (direction: 'down' | 'up') => {
    const command = direction === 'down' ? spec.down : spec.up;
    const atEnd = percent === null || (direction === 'down' ? percent <= 0 : percent >= 100);
    return (
      <ControlButton
        label={direction === 'down' ? '▼' : '▲'}
        accessibilityLabel={`${name} ${direction === 'down' ? 'dimmer' : 'brighter'}`}
        featureId={spec.featureId}
        target={command}
        invalid={!bindingOk(snapshot, command) || atEnd || pending}
        onPress={() => {
          void activate(spec.featureId, command);
          readBack.watch({
            key: spec.key,
            name: spec.state,
            operation: command,
            expected: value ?? 0,
            matches: (next) => {
              const after = numberAt(next, spec.index);
              return after !== null && after !== value;
            },
            failure: () => dimmerNotTaken(aircraft, spec.name),
          });
        }}
      />
    );
  };

  return (
    <View style={styles.row}>
      <Text style={styles.legend}>{spec.legend}</Text>
      <Text
        style={[styles.readout, link.valuesCurrent ? null : styles.stale]}
        accessibilityLabel={percent === null ? `${name} unknown` : `${name} ${percent} percent`}
      >
        {percent === null ? '—' : `${percent} %`}
      </Text>
      {key('down')}
      {key('up')}
    </View>
  );
}
