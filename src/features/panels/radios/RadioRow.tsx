import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import { formatDistance } from '@/domain/flight-data/format';
import { controlAvailability } from '@/domain/panels/control-availability';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { type RadioSpec, formatFrequency } from '@/features/panels/radios/radios';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    flexGrow: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
    minWidth: 56,
  },
  active: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
});

function courseText(course: number): string {
  const whole = ((Math.round(course) % 360) + 360) % 360;
  return `CRS ${String(whole === 0 ? 360 : whole).padStart(3, '0')}°`;
}

/**
 * One radio (F-21): X-Plane's active and standby values, a swap, and the standby as the button that
 * opens the keypad. Its controls are quiet, so the feature's reason and the swap's failure are
 * printed once, under the row, instead of under each button (C5).
 */
export function RadioRow({
  radio,
  readBack,
  onEnterStandby,
}: {
  radio: RadioSpec;
  readBack: ReadBack;
  onEnterStandby: () => void;
}) {
  const { snapshot, link, activate } = usePanel();
  const { units } = useUnits();
  const styles = useThemedStyles(makeStyles);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const read = (name: string | undefined) =>
    noFlight || name === undefined ? null : firstNumber(snapshot.telemetry[name]?.value);
  const active = read(radio.active);
  const standby = read(radio.standby);
  const text = (value: number | null) =>
    value === null ? '—' : formatFrequency(radio.kind, value);
  const notLive = !link.valuesCurrent && (active !== null || standby !== null);

  const details: string[] = [];
  if (!noFlight && radio.navId !== undefined) {
    const id = snapshot.telemetry[radio.navId]?.value;
    const decoded = id === undefined ? null : decodeDataRefString(id, 'data');
    if (decoded !== null) {
      details.push(decoded);
    }
  }
  const dme = read(radio.dme);
  if (read(radio.hasDme) === 1 && dme !== null) {
    details.push(formatDistance(dme, units.distance));
  }
  const course = read(radio.course);
  if (course !== null) {
    details.push(courseText(course));
  }

  const availability = controlAvailability(featureOf(snapshot.compatibility, radio.featureId));
  const message = readBack.messageFor(radio.key);
  const swap = () => {
    void activate(radio.featureId, radio.flip);
    if (standby !== null) {
      readBack.watch({
        key: radio.key,
        name: radio.active,
        operation: radio.flip,
        expected: standby,
        failure: () => `X-Plane did not swap ${radio.label}.`,
      });
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`${radio.label}: active ${text(active)}, standby ${text(standby)}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>{radio.label}</Text>
          <Text style={[styles.active, link.valuesCurrent ? null : styles.stale]}>
            {text(active)}
          </Text>
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        <ControlButton
          label="⇄"
          accessibilityLabel={`Swap ${radio.label} active and standby`}
          featureId={radio.featureId}
          target={radio.flip}
          quiet
          onPress={swap}
        />
        <ControlButton
          label={text(standby)}
          accessibilityLabel={`Enter ${radio.label} standby`}
          featureId={radio.featureId}
          target={radio.standby}
          quiet
          onPress={onEnterStandby}
        />
      </View>
      {details.length === 0 ? null : <BodyText muted>{details.join(' · ')}</BodyText>}
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <OperationNotice target={radio.flip} />
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
    </View>
  );
}
