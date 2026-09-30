import React from 'react';
import { Text, View } from 'react-native';

import { makeRowStyles } from '@/features/panels/flight-data/rowStyles';
import { useFlightValue } from '@/features/panels/flight-data/useFlightValue';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';

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
  const styles = useThemedStyles(makeRowStyles);
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
