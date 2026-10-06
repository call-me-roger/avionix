import React from 'react';
import { View } from 'react-native';

import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

export type LightBarState = 'engaged' | 'armed' | 'off';

const makeStyles = (theme: Theme) => ({
  bar: {
    height: 3,
    alignSelf: 'stretch' as const,
    marginHorizontal: 8,
    borderRadius: 1.5,
  },
  engaged: { backgroundColor: theme.avionics.engaged },
  armed: { borderWidth: 1.5, borderColor: theme.avionics.armed, backgroundColor: 'transparent' },
  off: { backgroundColor: theme.avionics.lightOff },
});

/**
 * The annunciator strip above a hardware key's legend (spec section 2): a solid fill when
 * engaged, a hollow outline when armed, a dim fill when off. Shape, not colour alone, carries the
 * state. Hidden from accessibility: the button's own label already speaks it.
 */
export function LightBar({ state }: { state: LightBarState }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={[styles.bar, styles[state]]}
      testID={`light-bar-${state}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
