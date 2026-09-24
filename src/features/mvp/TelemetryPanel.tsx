import React from 'react';
import { View } from 'react-native';

import type { SessionSnapshot, TelemetrySample } from '@/application/session-snapshot';
import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

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
  { label: 'Sim running time (s)', name: GENERIC_DATAREFS.heartbeat },
  { label: 'Indicated airspeed (kt)', name: GENERIC_DATAREFS.airspeed },
  { label: 'Heading bug (deg)', name: GENERIC_DATAREFS.headingBug },
];

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing.sm,
  },
  value: { fontVariant: ['tabular-nums' as const], fontWeight: 'bold' as const },
});

export function TelemetryPanel({ snapshot, now }: { snapshot: SessionSnapshot; now: number }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Section>
      <SectionTitle>Live telemetry</SectionTitle>
      {ROWS.map((row) => {
        const sample = snapshot.telemetry[row.name];
        const age =
          sample === undefined
            ? ''
            : ` (${Math.max(0, Math.round((now - sample.receivedAt) / 1000))}s ago)`;
        return (
          <View key={row.name} style={styles.row}>
            <BodyText>{row.label}</BodyText>
            <BodyText style={styles.value}>{formatValue(sample)}</BodyText>
            <BodyText muted>{age}</BodyText>
          </View>
        );
      })}
    </Section>
  );
}
