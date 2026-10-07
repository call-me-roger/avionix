import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { fuelPage } from '@/domain/engines/fuel';
import type { Scale } from '@/domain/engines/markings';
import { gaugesMissing, tanksUnavailable } from '@/domain/engines/messages';
import { drawnEngines } from '@/features/panels/engines/engine-reader';
import { GaugeBar } from '@/features/panels/engines/GaugeBar';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { useUnits } from '@/features/units/UnitsProvider';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

/** A tank's level as a bar: its quantity over its capacity. */
const LEVEL: Scale = { min: 0, max: 1, redline: null };

export const makeReadoutStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
    minHeight: 28,
  },
  label: {
    ...avionicsText(theme, true),
    width: 96,
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 0.5,
  },
  value: {
    ...numeric(theme, true),
    minWidth: 72,
    fontSize: 18,
    textAlign: 'right' as const,
    color: theme.avionics.legend,
  },
  stale: { color: theme.avionics.legendDim },
  bar: { flex: 1 },
  divider: { height: 1, backgroundColor: theme.avionics.bezelEdge },
});

function FuelRow({
  testID,
  label,
  text,
  spoken,
  stale,
  fraction = null,
}: {
  testID: string;
  label: string;
  text: string;
  spoken: string;
  stale: boolean;
  fraction?: number | null;
}) {
  const styles = useThemedStyles(makeReadoutStyles);
  return (
    <View testID={testID} style={styles.row} accessible accessibilityLabel={spoken}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, stale ? styles.stale : null]}>{text}</Text>
      <View style={styles.bar}>
        {fraction === null ? null : (
          <GaugeBar scale={LEVEL} bands={[]} value={fraction} tone="normal" stale={stale} />
        )}
      </View>
    </View>
  );
}

/** The FUEL page (spec §4.7): each used tank with its level, then the totalizer. */
export function FuelSection() {
  const styles = useThemedStyles(makeReadoutStyles);
  const { snapshot, link } = usePanel();
  const { units } = useUnits();
  const { reader, model } = useEnginesModel();
  const fuel = useMemo(() => fuelPage(reader, units, drawnEngines(model)), [reader, units, model]);
  const stale = !link.valuesCurrent;
  const name = aircraftName(snapshot);
  return (
    <AvionicsUnit testID="fuel-section" label={`FUEL ${fuel.unit}`}>
      {fuel.tanks === null ? (
        <BodyText muted>{tanksUnavailable(name)}</BodyText>
      ) : (
        fuel.tanks.map((tank) => (
          <FuelRow
            key={tank.slot}
            testID={`fuel-tank-${tank.slot}`}
            label={tank.name}
            text={tank.text}
            spoken={tank.spoken}
            fraction={tank.fraction}
            stale={stale}
          />
        ))
      )}
      <View style={styles.divider} />
      {fuel.total === null ? null : (
        <FuelRow
          testID="fuel-total"
          label="TOTAL"
          text={fuel.total.text}
          spoken={fuel.total.spoken}
          stale={stale}
        />
      )}
      <FuelRow
        testID="fuel-flow"
        label={`FLOW ${fuel.flowUnit}`}
        text={fuel.flow.text}
        spoken={fuel.flow.spoken}
        stale={stale}
      />
      {fuel.used === null ? null : (
        <FuelRow
          testID="fuel-used"
          label="USED"
          text={fuel.used.text}
          spoken={fuel.used.spoken}
          stale={stale}
        />
      )}
      <FuelRow
        testID="fuel-endurance"
        label="ENDURANCE"
        text={fuel.endurance.text}
        spoken={fuel.endurance.spoken}
        stale={stale}
      />
      {fuel.missing.length > 0 ? (
        <BodyText muted>{gaugesMissing(name, fuel.missing)}</BodyText>
      ) : null}
    </AvionicsUnit>
  );
}
