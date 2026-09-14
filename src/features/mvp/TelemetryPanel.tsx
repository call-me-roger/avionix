import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MVP_DATAREFS } from '@/application/mvp-bindings';
import type { SessionSnapshot, TelemetrySample } from '@/application/session-snapshot';

function formatValue(sample: TelemetrySample | undefined): string {
  if (sample === undefined) {
    return '-';
  }
  if (typeof sample.value === 'number') {
    return Number.isInteger(sample.value) ? String(sample.value) : sample.value.toFixed(1);
  }
  if (Array.isArray(sample.value)) {
    return `[${sample.value.join(', ')}]`;
  }
  return sample.value;
}

const ROWS: { label: string; name: string }[] = [
  { label: 'Sim running time (s)', name: MVP_DATAREFS.heartbeat },
  { label: 'Indicated airspeed (kt)', name: MVP_DATAREFS.airspeed },
  { label: 'Heading bug (deg)', name: MVP_DATAREFS.heading },
];

export function TelemetryPanel({ snapshot, now }: { snapshot: SessionSnapshot; now: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Live telemetry</Text>
      {ROWS.map((row) => {
        const sample = snapshot.telemetry[row.name];
        const age =
          sample === undefined
            ? ''
            : ` (${Math.max(0, Math.round((now - sample.receivedAt) / 1000))}s ago)`;
        return (
          <View key={row.name} style={styles.row}>
            <Text>{row.label}</Text>
            <Text style={styles.value}>{formatValue(sample)}</Text>
            <Text style={styles.muted}>{age}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  title: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  value: { fontVariant: ['tabular-nums'], fontWeight: 'bold' },
  muted: { color: '#666' },
});
