import React from 'react';
import { Text, View } from 'react-native';

import type { TrimSpec } from '@/domain/systems/controls';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

/** A mark centred on its `left`, standing across the track. */
const markBox = (top: number, width: number, height: number) => ({
  position: 'absolute' as const,
  top,
  width,
  height,
  marginLeft: -width / 2,
});

const makeStyles = (theme: Theme) => ({
  caption: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
  },
  // The scale: a 6 dp track, a centre tick, the takeoff band (pitch) and the pointer.
  track: { height: 6, margin: 6, borderRadius: 3, backgroundColor: theme.avionics.lightOff },
  tick: { ...markBox(-3, 2, 12), backgroundColor: theme.avionics.legendDim },
  takeoff: { ...markBox(-4, 6, 14), borderWidth: 1.5, borderColor: theme.avionics.engaged },
  pointer: { ...markBox(-5, 4, 16), backgroundColor: theme.avionics.legend },
  pointerDim: { backgroundColor: theme.avionics.legendDim },
  takeoffDim: { borderColor: theme.avionics.legendDim },
  ends: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
});

/** Where `value` (−1..1) sits along the track. */
const along = (value: number) => `${((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100}%` as const;

/**
 * One trim axis's scale (spec §4.6): the centre tick, the takeoff band (pitch) and the pointer,
 * dimmed on stale values. Hidden from screen readers: the readout beside it speaks the same
 * position.
 */
export function TrimScale({
  spec,
  value,
  takeoff,
}: {
  spec: TrimSpec;
  value: number | null;
  takeoff: number | null;
}) {
  const { link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const dim = !link.valuesCurrent;
  const mark = (at: number, style: object, dimStyle: object | null, testID?: string) => (
    <View testID={testID} style={[style, { left: along(at) }, dim ? dimStyle : null]} />
  );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        {mark(0, styles.tick, null)}
        {takeoff === null
          ? null
          : mark(takeoff, styles.takeoff, styles.takeoffDim, `trim-${spec.axis}-takeoff`)}
        {value === null
          ? null
          : mark(value, styles.pointer, styles.pointerDim, `trim-${spec.axis}-pointer`)}
      </View>
      <View style={styles.ends}>
        <Text style={styles.caption}>{spec.decrease.legend}</Text>
        <Text style={styles.caption}>{spec.increase.legend}</Text>
      </View>
    </View>
  );
}
