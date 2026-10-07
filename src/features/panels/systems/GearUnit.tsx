import React from 'react';
import { View } from 'react-native';

import { GEAR } from '@/domain/systems/controls';
import { FIXED_GEAR, gearNotTaken, unitUnavailable } from '@/domain/systems/messages';
import { type GearLamp, gearLamps, gearSummary, numberAt } from '@/domain/systems/readouts';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingMissing,
  bindingOk,
  valueOf,
} from '@/features/panels/systems/availability';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const LAMP_SIZE = 20;

const makeStyles = (theme: Theme) => ({
  lamps: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
  },
  lamp: { width: LAMP_SIZE, height: LAMP_SIZE, borderRadius: 3 },
  down: { backgroundColor: theme.avionics.engaged },
  transit: { borderWidth: 2, borderColor: theme.avionics.warning },
  up: { backgroundColor: theme.avionics.lightOff },
  // Stale: the same shapes, in `legendDim`, as LightBar dims (spec §4.5).
  downDim: { backgroundColor: theme.avionics.legendDim },
  transitDim: { borderColor: theme.avionics.legendDim },
  row: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  key: { flex: 1 },
});

/** The three gear lamps: green filled down, red outline in transit, unlit up. Not pressable. */
function GearLamps({ lamps, label }: { lamps: readonly GearLamp[]; label: string }) {
  const { link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const dim = !link.valuesCurrent;
  return (
    <View style={styles.lamps} accessible accessibilityLabel={label}>
      {lamps.map((lamp, index) => (
        <View
          key={index}
          testID={`gear-lamp-${index}-${lamp}`}
          style={[
            styles.lamp,
            styles[lamp],
            dim && lamp === 'down' ? styles.downDim : null,
            dim && lamp === 'transit' ? styles.transitDim : null,
          ]}
        />
      ))}
    </View>
  );
}

/**
 * Landing gear (spec §4.2, §4.4, §4.6): the lamps from `deploy_ratio`, and a lever key pair with
 * the handle's position selected. Both keys take a second tap. Fixed gear shows no lever.
 */
export function GearUnit({ readBack }: { readBack: ReadBack }) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const aircraft = aircraftName(snapshot);

  if (!bindingOk(snapshot, GEAR.handle)) {
    return bindingMissing(snapshot, GEAR.handle) ? (
      <AvionicsUnit label="GEAR">
        <BodyText muted>{unitUnavailable('Landing gear', aircraft)}</BodyText>
      </AvionicsUnit>
    ) : (
      <AvionicsUnit label="GEAR">{null}</AvionicsUnit>
    );
  }
  const retractable = bindingOk(snapshot, GEAR.retractable)
    ? numberAt(valueOf(snapshot, GEAR.retractable), 0)
    : null;
  if (retractable === 0) {
    return (
      <AvionicsUnit label="GEAR">
        <BodyText muted>{FIXED_GEAR}</BodyText>
      </AvionicsUnit>
    );
  }

  const handle = numberAt(valueOf(snapshot, GEAR.handle), 0);
  const handleDown = handle === null ? null : handle > 0.5;
  const lamps = bindingOk(snapshot, GEAR.deployment)
    ? gearLamps(valueOf(snapshot, GEAR.deployment))
    : null;
  const pending = readBack.pendingExpected('gear') !== null;
  const missing = [
    ...(bindingMissing(snapshot, GEAR.up) ? ['GEAR UP'] : []),
    ...(bindingMissing(snapshot, GEAR.down) ? ['GEAR DOWN'] : []),
  ];

  const key = (down: boolean) => {
    const command = down ? GEAR.down : GEAR.up;
    return (
      <ControlButton
        label={down ? 'GEAR DOWN' : 'GEAR UP'}
        featureId={GEAR.featureId}
        target={command}
        selected={handleDown === down}
        confirm
        style={styles.key}
        invalid={!bindingOk(snapshot, command) || handleDown === null || pending}
        onPress={() => {
          void activate(GEAR.featureId, command);
          readBack.watch({
            key: 'gear',
            name: GEAR.handle,
            operation: command,
            expected: down ? 1 : 0,
            failure: () => gearNotTaken(aircraft, down),
          });
        }}
      />
    );
  };

  return (
    <AvionicsUnit label="GEAR">
      {lamps === null ? null : <GearLamps lamps={lamps} label={gearSummary(lamps, handleDown)} />}
      <View style={styles.row}>
        {key(false)}
        {key(true)}
      </View>
      <UnitLines missing={missing} readBack={readBack} keys={['gear']} />
    </AvionicsUnit>
  );
}
