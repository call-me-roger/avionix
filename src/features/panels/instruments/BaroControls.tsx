import React from 'react';
import { Text, View } from 'react-native';

import {
  FEATURE_ALTIMETER_SETTING,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { BARO_RANGE, STD_INHG, baroStep, formatBaro, toInHg } from '@/domain/instruments/baro';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs },
  reading: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
  steps: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
});

/**
 * The panel's only write (R4, R12). Every control sends from the read-back setting, never a typed
 * or previous one, and all four share one target: while a write is pending all four are disabled,
 * so presses cannot stack on a stale value. A read-only DataRef disables them with one sentence,
 * printed once by the Set button (R5).
 */
export function BaroControls() {
  const styles = useThemedStyles(makeStyles);
  const { snapshot, link, write } = usePanel();
  const { units } = useUnits();
  const unit = units.pressure;
  const missing = snapshot.compatibility.bindings[D.barometer]?.status === 'missing';
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const inHg = noFlight ? null : firstNumber(snapshot.telemetry[D.barometer]?.value);
  const send = (value: number) => void write(FEATURE_ALTIMETER_SETTING, D.barometer, value);
  const reading = missing
    ? 'not available on this aircraft'
    : inHg === null
      ? 'no value'
      : formatBaro(inHg, unit);
  const range = BARO_RANGE[unit];
  return (
    <View style={styles.wrap}>
      <View
        style={styles.reading}
        accessible
        accessibilityLabel={`Altimeter setting: ${reading}${link.valuesCurrent || inHg === null ? '' : ', not live'}`}
      >
        <BodyText>Altimeter setting</BodyText>
        <Text style={[styles.value, link.valuesCurrent ? null : styles.stale]}>
          {inHg === null ? '—' : formatBaro(inHg, unit)}
        </Text>
      </View>
      <View style={styles.steps}>
        <ControlButton
          label="−"
          accessibilityLabel="Decrease altimeter setting"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          invalid={inHg === null}
          quiet
          onPress={() => inHg !== null && send(baroStep(inHg, unit, -1))}
        />
        <ControlButton
          label="+"
          accessibilityLabel="Increase altimeter setting"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          invalid={inHg === null}
          quiet
          onPress={() => inHg !== null && send(baroStep(inHg, unit, 1))}
        />
        <ControlButton
          label="STD"
          accessibilityLabel="Set standard pressure"
          featureId={FEATURE_ALTIMETER_SETTING}
          target={D.barometer}
          quiet
          onPress={() => send(STD_INHG)}
        />
      </View>
      <ValueEntry
        label="Altimeter setting"
        unit={unit}
        featureId={FEATURE_ALTIMETER_SETTING}
        target={D.barometer}
        min={range.min}
        max={range.max}
        onSubmit={(value) => send(toInHg(value, unit))}
      />
    </View>
  );
}
