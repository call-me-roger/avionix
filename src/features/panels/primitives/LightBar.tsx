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
  // A lamp the panel cannot vouch for (stale values): the same shape, in `legendDim`.
  engagedDim: { backgroundColor: theme.avionics.legendDim },
  armedDim: { borderColor: theme.avionics.legendDim },
});

/**
 * The annunciator strip above a hardware key's legend (spec section 2): a solid fill when
 * engaged, a hollow outline when armed, a dim fill when off. Shape, not colour alone, carries the
 * state. Hidden from accessibility: the button's own label already speaks it. `dim` (values not
 * current) keeps the shape but draws a lit bar in `legendDim`, so a last-known state never glows as
 * if X-Plane had just reported it.
 */
export function LightBar({ state, dim = false }: { state: LightBarState; dim?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  // An off bar is already unlit; only a lit one has anything to dim.
  const dimmed = { engaged: styles.engagedDim, armed: styles.armedDim, off: null }[state];
  return (
    <View
      style={[styles.bar, styles[state], dim ? dimmed : null]}
      testID={`light-bar-${state}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
