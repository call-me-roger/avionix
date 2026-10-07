import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { type PowerRow, electricalPage } from '@/domain/engines/electrical';
import { gaugesMissing } from '@/domain/engines/messages';
import { drawnEngines } from '@/features/panels/engines/engine-reader';
import { makeReadoutStyles } from '@/features/panels/engines/FuelSection';
import { useEnginesModel } from '@/features/panels/engines/useEnginesModel';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { aircraftName } from '@/features/panels/systems/availability';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';

function PowerRowView({ row, stale }: { row: PowerRow; stale: boolean }) {
  const styles = useThemedStyles(makeReadoutStyles);
  const value = [styles.value, stale ? styles.stale : null];
  return (
    <View testID={`elec-${row.key}`} style={styles.row} accessible accessibilityLabel={row.spoken}>
      <Text style={styles.label}>{row.label}</Text>
      {row.volts === null ? null : <Text style={value}>{`${row.volts} V`}</Text>}
      {row.amps === null ? null : <Text style={value}>{`${row.amps} A`}</Text>}
    </View>
  );
}

/** The ELEC page (spec §4.8): buses, batteries and generators, by index, without bands. */
export function ElectricalSection() {
  const { snapshot, link } = usePanel();
  const { reader, model } = useEnginesModel();
  const electrical = useMemo(() => electricalPage(reader, drawnEngines(model)), [reader, model]);
  const stale = !link.valuesCurrent;
  const rows = [...electrical.buses, ...electrical.batteries, ...electrical.generators];
  return (
    <AvionicsUnit testID="electrical-section" label="ELECTRICAL">
      {rows.map((row) => (
        <PowerRowView key={row.key} row={row} stale={stale} />
      ))}
      {electrical.missing.length > 0 ? (
        <BodyText muted>{gaugesMissing(aircraftName(snapshot), electrical.missing)}</BodyText>
      ) : null}
    </AvionicsUnit>
  );
}
