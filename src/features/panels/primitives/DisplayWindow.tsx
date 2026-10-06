import React from 'react';
import { Text, View } from 'react-native';

import { useKeyEnabled } from '@/features/panels/primitives/KeyEnabledContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { numeric } from '@/theme/typography';

export type DisplayWindowRole = 'active' | 'standby' | 'selected' | 'plain';

const makeStyles = (theme: Theme) => ({
  window: {
    position: 'relative' as const,
    backgroundColor: theme.avionics.glass,
    borderWidth: 1,
    borderColor: theme.avionics.glassEdge,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-end' as const,
  },
  caption: {
    alignSelf: 'flex-start' as const,
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
  },
  large: { ...numeric(theme, true), fontSize: theme.typography.displaySize },
  small: { ...numeric(theme, true), fontSize: theme.typography.titleSize },
  active: { color: theme.avionics.engaged },
  standby: { color: theme.avionics.legend },
  selected: { color: theme.avionics.selected },
  plain: { color: theme.avionics.legend },
  stale: { color: theme.avionics.legendDim },
  warning: { color: theme.avionics.warning },
  tuningFrame: {
    position: 'absolute' as const,
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: theme.avionics.selected,
    borderRadius: 4,
  },
});

interface Props {
  text: string;
  role: DisplayWindowRole;
  size?: 'large' | 'small';
  /** Above the value, e.g. "ACT", "STBY", "HDG". */
  caption?: string;
  /** Draws the value in `legendDim`; the "not live" words beside it stay the real cue. */
  stale?: boolean;
  /** The Garmin tuning box: a 2 dp `selected` frame inset by 2. */
  tuning?: boolean;
  /** Overrides the role colour with `avionics.warning` (an emergency squawk), unless dimmed. */
  tone?: 'warning';
  testID?: string;
}

/**
 * The glass window that shows one value (spec section 2): a radio frequency, a squawk, a selector
 * target. `accessible={false}`: the pressable or summary around it speaks for it.
 */
export function DisplayWindow({
  text,
  role,
  size = 'large',
  caption,
  stale = false,
  tuning = false,
  tone,
  testID,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  // Dims exactly as `stale` does when the `ControlButton` this window sits inside (if any) is
  // disabled, so a pressable value never stays full-brightness once its key cannot be pressed.
  const keyEnabled = useKeyEnabled();
  const dimmed = stale || !keyEnabled;
  return (
    <View style={styles.window} testID={testID} accessible={false}>
      {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
      <Text
        style={[
          size === 'large' ? styles.large : styles.small,
          styles[role],
          tone === 'warning' ? styles.warning : null,
          // After the warning tone: a stale 7700 dims too; its "EMERG" caption still says why.
          dimmed ? styles.stale : null,
        ]}
      >
        {text}
      </Text>
      {tuning ? (
        <View style={styles.tuningFrame} pointerEvents="none" testID="display-window-tuning" />
      ) : null}
    </View>
  );
}
