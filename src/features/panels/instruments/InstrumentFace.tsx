import React from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Line } from 'react-native-svg';

import type { InstrumentStatus } from '@/domain/instruments/labels';
import { countRender } from '@/features/panels/instruments/svg-parts';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** How much a stale instrument's pointers and digits fade behind the red X. */
const NOT_LIVE_OPACITY = 0.4;

const makeStyles = (theme: Theme) => ({
  overlay: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing.xs,
  },
  flag: {
    backgroundColor: theme.instrument.flag,
    color: theme.instrument.flagText,
    fontSize: theme.typography.bodySize,
    fontWeight: 'bold' as const,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    overflow: 'hidden' as const,
  },
  note: {
    color: theme.instrument.marking,
    fontSize: theme.typography.bodySize,
    textAlign: 'center' as const,
  },
});

interface Props {
  testID: string;
  label: string;
  status: InstrumentStatus;
  width: number;
  height: number;
  viewBox: { width: number; height: number };
  /** Drawn in every state: the face and its fixed scale. */
  scale: React.ReactNode;
  /** Drawn only with a value: pointers, tapes, digits (R8, R9 — never a default in their place). */
  children?: React.ReactNode;
}

/**
 * Every instrument's frame: one accessible element carrying its value in words, and the four
 * states of the spec's table. Not live keeps the last pointers, faded, under a red X with a
 * NOT LIVE flag — the failure flag pilots know, so a frozen instrument is never mistaken for a
 * working one (R6, R7).
 */
export function InstrumentFace({
  testID,
  label,
  status,
  width,
  height,
  viewBox,
  scale,
  children,
}: Props) {
  countRender(testID);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const hasValue = status === 'live' || status === 'notLive';
  const stroke = viewBox.width / 40;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}>
        {scale}
        {hasValue ? <G opacity={status === 'notLive' ? NOT_LIVE_OPACITY : 1}>{children}</G> : null}
        {status === 'notLive' ? (
          <G>
            <Line
              x1={0}
              y1={0}
              x2={viewBox.width}
              y2={viewBox.height}
              stroke={theme.instrument.flag}
              strokeWidth={stroke}
            />
            <Line
              x1={viewBox.width}
              y1={0}
              x2={0}
              y2={viewBox.height}
              stroke={theme.instrument.flag}
              strokeWidth={stroke}
            />
          </G>
        ) : null}
      </Svg>
      {status === 'notLive' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.flag}>NOT LIVE</Text>
        </View>
      ) : null}
      {status === 'unavailable' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.note}>Not available on this aircraft</Text>
        </View>
      ) : null}
      {status === 'noValue' ? (
        <View pointerEvents="none" style={styles.overlay}>
          <Text style={styles.note}>—</Text>
        </View>
      ) : null}
    </View>
  );
}
