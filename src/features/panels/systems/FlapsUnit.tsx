import React from 'react';
import { Text, View } from 'react-native';

import { FLAPS } from '@/domain/systems/controls';
import { flapsNotTaken, unitUnavailable } from '@/domain/systems/messages';
import { flapReadout, flapsMoved, numberAt } from '@/domain/systems/readouts';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { aircraftName, bindingOk, valueOf } from '@/features/panels/systems/availability';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.touch.spacing },
  // The radios' glass (R-01): one value, with MOVING under it while the flaps lag the handle.
  window: {
    flex: 1,
    minHeight: theme.touch.minTarget,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.avionics.glass,
    borderWidth: 1,
    borderColor: theme.avionics.glassEdge,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  value: {
    ...numeric(theme, true),
    fontSize: theme.typography.titleSize,
    color: theme.avionics.legend,
  },
  moving: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.caution,
  },
  stale: { color: theme.avionics.legendDim },
});

/**
 * Flaps (spec §4.2, §4.6): the handle's detent and whether the flaps still move, one notch per
 * press. Adopted is any handle change in the pressed direction. ▲ is inert at UP, ▼ at FULL.
 */
export function FlapsUnit({ readBack }: { readBack: ReadBack }) {
  const { snapshot, link, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const aircraft = aircraftName(snapshot);

  if (!bindingOk(snapshot, FLAPS.handle)) {
    return (
      <AvionicsUnit label="FLAPS">
        <BodyText muted>{unitUnavailable('Flaps', aircraft)}</BodyText>
      </AvionicsUnit>
    );
  }
  const optional = (name: string) =>
    bindingOk(snapshot, name) ? numberAt(valueOf(snapshot, name), 0) : null;
  const handle = numberAt(valueOf(snapshot, FLAPS.handle), 0);
  const readout = flapReadout(handle, optional(FLAPS.position), optional(FLAPS.detents));
  const pending = readBack.pendingExpected('flaps') !== null;
  const stale = link.valuesCurrent ? null : styles.stale;
  const missing = [
    ...(bindingOk(snapshot, FLAPS.up) ? [] : ['FLAPS UP']),
    ...(bindingOk(snapshot, FLAPS.down) ? [] : ['FLAPS DOWN']),
  ];

  const key = (direction: 'up' | 'down') => {
    const command = direction === 'up' ? FLAPS.up : FLAPS.down;
    const atEnd = readout === null || (direction === 'up' ? readout.atUp : readout.atFull);
    return (
      <ControlButton
        label={direction === 'up' ? '▲' : '▼'}
        accessibilityLabel={`Flaps ${direction} one notch`}
        featureId={FLAPS.featureId}
        target={command}
        invalid={!bindingOk(snapshot, command) || atEnd || pending}
        onPress={() => {
          if (handle === null) {
            return;
          }
          void activate(FLAPS.featureId, command);
          readBack.watch({
            key: 'flaps',
            name: FLAPS.handle,
            operation: command,
            expected: handle,
            matches: (value) => flapsMoved(direction, handle, numberAt(value, 0)),
            failure: () => flapsNotTaken(aircraft, direction),
          });
        }}
      />
    );
  };

  return (
    <AvionicsUnit label="FLAPS">
      <View style={styles.row}>
        <View
          style={styles.window}
          testID="flaps-readout"
          accessible
          accessibilityLabel={readout?.spoken ?? 'Flaps position unknown'}
        >
          <Text style={[styles.value, stale]}>{readout?.label ?? '—'}</Text>
          {readout?.moving === true ? <Text style={[styles.moving, stale]}>MOVING</Text> : null}
        </View>
        {key('up')}
        {key('down')}
      </View>
      <UnitLines missing={missing} readBack={readBack} keys={['flaps']} />
    </AvionicsUnit>
  );
}
