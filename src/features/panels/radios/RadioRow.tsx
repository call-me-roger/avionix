import React, { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { featureOf } from '@/application/compatibility';
import { formatDme } from '@/domain/navigation/hsi';
import { controlAvailability } from '@/domain/panels/control-availability';
import { decodeDataRefString } from '@/domain/simulator/dataref-string';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { type RadioSpec, formatFrequency } from '@/features/panels/radios/radios';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { numeric } from '@/theme/typography';

/** Below this content width, the active/swap/standby line stacks vertically (a narrow phone). */
const NARROW_ROW_WIDTH = 360;

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  rowNarrow: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  flex1: { flex: 1 },
  details: {
    ...numeric(theme),
    fontSize: theme.typography.titleSize,
    color: theme.avionics.selected,
  },
  stale: { color: theme.avionics.legendDim },
});

function courseText(course: number): string {
  const whole = ((Math.round(course) % 360) + 360) % 360;
  return `CRS ${String(whole === 0 ? 360 : whole).padStart(3, '0')}°`;
}

/**
 * One radio (F-21) as an avionics hardware unit: X-Plane's active and standby values in glass
 * display windows, a swap key between them, and the standby window inside the button that opens
 * the keypad (spec section 5). Its controls are quiet, so the feature's reason and the swap's
 * failure are printed once, under the row, instead of under each button (C5).
 */
export function RadioRow({
  radio,
  readBack,
  onEnterStandby,
  entry = null,
}: {
  radio: RadioSpec;
  readBack: ReadBack;
  onEnterStandby: () => void;
  /** The narrow layout's keypad, rendered right under this row's first line (I1). */
  entry?: React.ReactNode;
}) {
  const { snapshot, link, activate } = usePanel();
  const { units } = useUnits();
  const styles = useThemedStyles(makeStyles);
  const [narrow, setNarrow] = useState(false);
  const onLayout = (event: LayoutChangeEvent) => {
    setNarrow(event.nativeEvent.layout.width < NARROW_ROW_WIDTH);
  };
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const read = (name: string | undefined) =>
    noFlight || name === undefined ? null : firstNumber(snapshot.telemetry[name]?.value);
  const active = read(radio.active);
  const standby = read(radio.standby);
  // A frequency that is not a positive number is no value at all (I3): 0 and negative readings
  // (an uninitialised DataRef, or an add-on that reports -1) show as "—", never as a number.
  const text = (value: number | null) =>
    value === null || value <= 0 ? '—' : formatFrequency(radio.kind, value);
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
    details.push(formatDme(dme, units.distance));
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
    <AvionicsUnit label={radio.label} testID={`radio-row-${radio.key}`}>
      <View style={[styles.row, narrow ? styles.rowNarrow : null]} onLayout={onLayout}>
        <View
          style={styles.flex1}
          accessible
          accessibilityLabel={`${radio.label}: active ${text(active)}, standby ${text(standby)}${notLive ? ', not live' : ''}`}
        >
          <DisplayWindow
            text={text(active)}
            role="active"
            caption="ACT"
            stale={!link.valuesCurrent}
            testID={`radio-active-${radio.key}`}
          />
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
          style={styles.flex1}
          onPress={onEnterStandby}
        >
          <DisplayWindow
            text={text(standby)}
            role="standby"
            caption="STBY"
            tuning
            stale={!link.valuesCurrent}
          />
        </ControlButton>
      </View>
      {notLive ? <BodyText muted>not live</BodyText> : null}
      {entry}
      {details.length === 0 ? null : (
        <Text style={[styles.details, link.valuesCurrent ? null : styles.stale]}>
          {details.join(' · ')}
        </Text>
      )}
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <OperationNotice target={radio.flip} />
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
    </AvionicsUnit>
  );
}
