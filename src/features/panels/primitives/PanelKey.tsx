import React from 'react';
import { Pressable, type StyleProp, Text, type ViewStyle } from 'react-native';

import { LightBar } from '@/features/panels/primitives/LightBar';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  key: {
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
});

/**
 * A local display key with the R-01 key face: a page tab (Systems, Engines) or a display switch
 * (LEAN). It writes nothing, so it is a plain key, not a ControlButton: the light bar is engaged
 * when `lit`, else off, over the legend. The spoken label is the legend unless given.
 */
export function PanelKey({
  testID,
  legend,
  accessibilityLabel,
  role,
  selected = false,
  checked = false,
  lit,
  onPress,
  style,
}: {
  testID: string;
  legend: string;
  accessibilityLabel?: string;
  role: 'tab' | 'switch';
  /** A tab's state. */
  selected?: boolean;
  /** A switch's state. */
  checked?: boolean;
  lit: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? legend}
      accessibilityState={role === 'tab' ? { selected } : { checked }}
      onPress={onPress}
      style={[styles.key, style]}
    >
      <LightBar state={lit ? 'engaged' : 'off'} />
      <Text style={styles.legend}>{legend}</Text>
    </Pressable>
  );
}
