import React from 'react';
import { Text, View } from 'react-native';

import type { DataRefValue } from '@/domain/simulator/types';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export function formatReading(value: DataRefValue): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  return value;
}

const makeStyles = (theme: Theme) => ({
  row: {
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
});

/**
 * One value, only ever from the simulator (R10). Not current → muted and "not live" (R7); a
 * DataRef the aircraft lacks → said in words rather than a dash that reads as "not yet" (F-03).
 */
export function Readout({
  label,
  name,
  unit = '',
}: {
  label: string;
  name: string;
  unit?: string;
}) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  if (snapshot.compatibility.bindings[name]?.status === 'missing') {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${label}: not available on this aircraft`}
      >
        <BodyText>{label}</BodyText>
        <BodyText muted>not available on this aircraft</BodyText>
      </View>
    );
  }
  const sample = snapshot.telemetry[name];
  const text = sample === undefined ? '—' : `${formatReading(sample.value)}${unit}`;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${text}${link.valuesCurrent ? '' : ', not live'}`}
    >
      <BodyText>{label}</BodyText>
      <Text style={[styles.value, link.valuesCurrent ? null : styles.stale]}>{text}</Text>
      {link.valuesCurrent ? null : <BodyText muted>not live</BodyText>}
    </View>
  );
}
