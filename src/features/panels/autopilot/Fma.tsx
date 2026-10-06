import React, { useEffect, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type StyleProp,
  Text,
  type TextStyle,
  View,
} from 'react-native';

import type { FmaSlot } from '@/domain/autopilot/fma';
import { useFma } from '@/features/panels/autopilot/useFma';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

/** Half of the 2 Hz flash: on this long, then off this long. */
const FLASH_HALF_MS = 250;
const FLASH_DIM = 0.15;
const MISSING = '—';

const makeStyles = (theme: Theme) => ({
  wrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  glass: {
    flex: 1,
    flexDirection: 'row' as const,
    minHeight: 48,
    backgroundColor: theme.avionics.glass,
    borderWidth: 1,
    borderColor: theme.avionics.glassEdge,
    borderRadius: 6,
  },
  column: {
    flex: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
  },
  // The mode columns carry the longest words ("VS −1500FPM", "NAV  APR").
  wide: { flex: 1.5 },
  divider: { borderLeftWidth: 1, borderLeftColor: theme.avionics.glassEdge },
  row: {
    minHeight: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing.sm,
  },
  cell: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    textAlign: 'center' as const,
  },
  compact: { fontSize: theme.typography.captionSize },
  engaged: { color: theme.avionics.engaged },
  armed: { color: theme.avionics.armed },
  // Reverse video, so a disconnect never differs from an engaged AP by colour alone (steady under
  // reduced motion, it would otherwise be a green AP turned amber).
  disconnectAp: {
    color: theme.avionics.glass,
    backgroundColor: theme.avionics.caution,
    borderRadius: 2,
    paddingHorizontal: 3,
    overflow: 'hidden' as const,
  },
  dim: { color: theme.avionics.legendDim },
  box: {
    borderWidth: 1.5,
    borderColor: theme.avionics.engaged,
    borderRadius: 2,
    paddingHorizontal: 3,
  },
});

/**
 * The flight-mode annunciator, laid out like the G1000's AFCS status bar: A/T, lateral, AP/FD and
 * vertical, engaged (green) over armed (white). A new mode is boxed for 10 s; an autopilot
 * disconnect flashes a reverse-video amber AP for 5 s, steady under reduced motion, and a tap
 * acknowledges it. "—" marks the columns only while there is no mode data at all.
 * `compact` is the PFD's: smaller text, and no "not live" of its own, as the PFD fades as a whole.
 */
export function Fma({ compact = false }: { compact?: boolean }) {
  const { link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const reducedMotion = useReducedMotion();
  const { columns, boxed, disconnected, acknowledge, text, hasValue } = useFma();
  const notLive = !link.valuesCurrent && hasValue;
  const cell = [styles.cell, compact ? styles.compact : null];
  // Stale values are dimmed throughout; "not live" beside the strip is the real cue.
  const tone = (live: TextStyle): StyleProp<TextStyle> => [
    cell,
    link.valuesCurrent ? live : styles.dim,
  ];
  // With mode data an empty cell stays blank, as on the G1000; "—" only says there is none.
  const missing = hasValue ? null : <Text style={[cell, styles.dim]}>{MISSING}</Text>;

  const active = (slot: FmaSlot, word: string | null) => {
    if (word === null) {
      return missing;
    }
    const label = <Text style={tone(styles.engaged)}>{word}</Text>;
    return boxed(slot) ? (
      <View testID={`fma-box-${slot}`} style={styles.box}>
        {label}
      </View>
    ) : (
      label
    );
  };
  const armed = (words: readonly string[]) =>
    words.length === 0 ? null : <Text style={tone(styles.armed)}>{words.join('  ')}</Text>;

  const { autothrottle, lateral, vertical } = columns;
  const verticalWord =
    vertical.active === null || vertical.reference === null
      ? vertical.active
      : `${vertical.active} ${vertical.reference}`;
  const status =
    disconnected || columns.ap || columns.fd ? (
      <>
        {disconnected ? (
          <FlashingAp style={[cell, styles.disconnectAp]} steady={reducedMotion} />
        ) : columns.ap ? (
          active('ap', 'AP')
        ) : null}
        {columns.fd ? <Text style={tone(styles.engaged)}>FD</Text> : null}
      </>
    ) : (
      missing
    );

  const glass = (
    <Pressable
      testID="autopilot-fma"
      style={styles.glass}
      onPress={disconnected ? acknowledge : undefined}
      accessibilityRole="text"
      accessibilityLabel={`Autopilot modes: ${text}${disconnected ? ', autopilot disconnected' : ''}${notLive ? ', not live' : ''}`}
      accessibilityHint={disconnected ? 'Tap to acknowledge' : undefined}
    >
      <View style={styles.column}>
        <View style={styles.row}>
          {active(
            'autothrottle',
            autothrottle.active === null ? null : `A/T ${autothrottle.active}`,
          )}
        </View>
        <View style={styles.row}>
          {autothrottle.armed ? <Text style={tone(styles.armed)}>A/T</Text> : null}
        </View>
      </View>
      <View style={[styles.column, styles.wide, styles.divider]}>
        <View style={styles.row}>{active('lateral', lateral.active)}</View>
        <View style={styles.row}>{armed(lateral.armed)}</View>
      </View>
      <View style={[styles.column, styles.divider]}>
        <View style={styles.row}>{status}</View>
        <View style={styles.row} />
      </View>
      <View style={[styles.column, styles.wide, styles.divider]}>
        <View style={styles.row}>{active('vertical', verticalWord)}</View>
        <View style={styles.row}>{armed(vertical.armed)}</View>
      </View>
    </Pressable>
  );

  // Always in the row wrap, so the glass's flex fills the width and never the parent's height.
  return (
    <View style={styles.wrap}>
      {glass}
      {notLive && !compact ? <BodyText muted>not live</BodyText> : null}
    </View>
  );
}

/** The disconnect's amber AP: a 2 Hz flash for as long as it is mounted, steady when asked. */
function FlashingAp({ style, steady }: { style: StyleProp<TextStyle>; steady: boolean }) {
  // Made once, kept for the life of the flash; state, not a ref, so render may read it.
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (steady) {
      return undefined;
    }
    const step = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: 0,
        delay: FLASH_HALF_MS,
        useNativeDriver: Platform.OS !== 'web',
      });
    const loop = Animated.loop(Animated.sequence([step(FLASH_DIM), step(1)]));
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [steady, opacity]);

  return (
    <Animated.Text testID="fma-ap-disconnect" style={[style, { opacity }]}>
      AP
    </Animated.Text>
  );
}
