import React from 'react';
import { Text, View } from 'react-native';

import { useFlightValue } from '@/features/panels/flight-data/useFlightValue';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

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
 * One flight-data value, formatted and unit-aware. Same row shape as `Readout` (F-04): a missing
 * DataRef is said in words (F-03), and a value not current is muted with "not live" (R7).
 */
export function FlightValue({
  label,
  names,
  format,
}: {
  label: string;
  names: readonly string[];
  format: (values: readonly number[]) => string;
}) {
  const { text, missing, current } = useFlightValue(names, format);
  const styles = useThemedStyles(makeStyles);
  if (missing) {
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
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${text}${current ? '' : ', not live'}`}
    >
      <BodyText>{label}</BodyText>
      <Text style={[styles.value, current ? null : styles.stale]}>{text}</Text>
      {current ? null : <BodyText muted>not live</BodyText>}
    </View>
  );
}
