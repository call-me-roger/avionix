import React from 'react';
import { Text, View } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import type { SelectorPosition } from '@/domain/systems/controls';
import { selectorNotTaken } from '@/domain/systems/messages';
import { numberAt } from '@/domain/systems/readouts';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingMissing,
  bindingOk,
  sentenceCase,
  valueOf,
} from '@/features/panels/systems/availability';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  caption: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
  },
  row: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  key: { flex: 1 },
});

/** The selector's positions that cannot be selected here: S3, for the unit's line. */
export function selectorMissing(
  snapshot: SessionSnapshot,
  state: string,
  positions: readonly SelectorPosition[],
): SelectorPosition[] {
  if (bindingMissing(snapshot, state)) {
    return [...positions];
  }
  return positions.filter((position) => bindingMissing(snapshot, position.command));
}

/**
 * A rotary selector as segment keys (fuel selector, magnetos; spec §4.2, §4.6): the position
 * X-Plane reports is selected, and a press sends that position's own command. Not drawn without
 * its state (S3); a position whose command did not resolve is drawn disabled.
 */
export function SelectorKeys({
  label,
  what,
  featureId,
  state,
  index,
  positions,
  keyPrefix,
  readBack,
}: {
  label: string;
  /** For sentences and screen readers, lower case: "fuel selector", "magnetos 1". */
  what: string;
  featureId: string;
  state: string;
  index: number;
  positions: readonly SelectorPosition[];
  keyPrefix: string;
  readBack: ReadBack;
}) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  if (!bindingOk(snapshot, state)) {
    return null;
  }
  const current = numberAt(valueOf(snapshot, state), index);
  const pending = readBack.pendingExpected(keyPrefix) !== null;
  const aircraft = aircraftName(snapshot);
  const spokenWhat = sentenceCase(what);

  return (
    <View>
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.row}>
        {positions.map((position) => (
          <ControlButton
            key={position.key}
            label={position.legend}
            accessibilityLabel={`${spokenWhat} ${position.legend}`}
            featureId={featureId}
            target={position.command}
            selected={current === position.value}
            confirm={position.confirm}
            style={styles.key}
            invalid={!bindingOk(snapshot, position.command) || pending}
            onPress={() => {
              void activate(featureId, position.command);
              readBack.watch({
                key: keyPrefix,
                name: state,
                operation: position.command,
                expected: position.value,
                matches: (value) => numberAt(value, index) === position.value,
                failure: () => selectorNotTaken(aircraft, what, position.name),
              });
            }}
          />
        ))}
      </View>
    </View>
  );
}
