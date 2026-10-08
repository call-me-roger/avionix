import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { MAP_RANGES, type MapOrientation, type MapRange } from '@/domain/map/catalogue';
import { rangeLabel } from '@/domain/map/map-format';
import type { DistanceUnit } from '@/domain/units/units';
import { ActionButton } from '@/theme/ActionButton';
import { type RadioChipOption, RadioChips } from '@/theme/RadioChips';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const ORIENTATION_OPTIONS: readonly RadioChipOption<MapOrientation>[] = [
  { value: 'north', label: 'North up', accessibilityLabel: 'North up' },
  { value: 'track', label: 'Track up', accessibilityLabel: 'Track up' },
];

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.touch.spacing,
  },
  // RadioChips keeps a bottom margin for forms; inside this row it would push the chips up.
  chips: { marginBottom: -theme.spacing.lg },
  stepper: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing.sm },
  step: {
    minWidth: theme.touch.minTarget,
    minHeight: theme.touch.minTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepDisabled: { opacity: 0.45 },
  stepText: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  range: {
    color: theme.colors.text,
    fontSize: theme.typography.bodySize,
    minWidth: 56,
    textAlign: 'center' as const,
  },
});

/** Local view controls: they never touch the simulator, so they work on a dead link too. */
export function MapControls({
  orientation,
  range,
  unit,
  trackAvailable,
  panned,
  onOrientation,
  onRange,
  onCentre,
}: {
  orientation: MapOrientation;
  range: MapRange;
  unit: DistanceUnit;
  trackAvailable: boolean;
  panned: boolean;
  onOrientation: (next: MapOrientation) => void;
  onRange: (next: MapRange) => void;
  onCentre: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const index = MAP_RANGES.indexOf(range);
  const atMin = index <= 0;
  const atMax = index >= MAP_RANGES.length - 1;
  const step = (by: -1 | 1) => {
    const next = MAP_RANGES[index + by];
    if (next !== undefined) {
      onRange(next);
    }
  };
  const label = rangeLabel(range, unit);
  return (
    <View testID="map-controls" style={styles.row}>
      <View style={styles.chips}>
        <RadioChips
          options={ORIENTATION_OPTIONS}
          selected={trackAvailable ? orientation : 'north'}
          onSelect={onOrientation}
          accessibilityLabel="Map orientation"
        />
      </View>
      <View style={styles.stepper}>
        <Pressable
          testID="map-range-down"
          accessibilityRole="button"
          accessibilityLabel={`Zoom in, range ${label}`}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          onPress={() => step(-1)}
          style={[styles.step, atMin ? styles.stepDisabled : null]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.range}>{label}</Text>
        <Pressable
          testID="map-range-up"
          accessibilityRole="button"
          accessibilityLabel={`Zoom out, range ${label}`}
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          onPress={() => step(1)}
          style={[styles.step, atMax ? styles.stepDisabled : null]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      {panned ? (
        <ActionButton testID="map-centre" title="Centre" variant="secondary" onPress={onCentre} />
      ) : null}
    </View>
  );
}
