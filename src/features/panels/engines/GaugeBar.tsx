import React from 'react';
import { View } from 'react-native';

import { type Band, type Scale, type Tone, scaleFraction } from '@/domain/engines/markings';
import { bandColour, toneColour } from '@/features/panels/engines/tone';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const TRACK = 6;
const FRAME = 14;

const makeStyles = (theme: Theme) => ({
  frame: { height: FRAME, justifyContent: 'center' as const },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: theme.avionics.lightOff,
    overflow: 'hidden' as const,
  },
  band: { position: 'absolute' as const, top: 0, bottom: 0 },
  tick: { position: 'absolute' as const, top: 0, width: 2, height: FRAME, marginLeft: -1 },
  pointer: {
    position: 'absolute' as const,
    top: 0,
    width: 4,
    height: FRAME,
    marginLeft: -2,
    borderRadius: 1,
  },
});

/** A fraction as a style percentage, to one decimal: 0.909 → '90.9%'. */
function percent(fraction: number): `${number}%` {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/**
 * One gauge as a horizontal bar (spec §4.5): the aircraft's bands on a dark track, the redline and
 * the lean-assist peak as ticks, the pointer at the value in its tone. Hidden from accessibility:
 * the cell that holds it speaks the reading.
 */
export function GaugeBar({
  scale,
  bands,
  value,
  tone,
  stale,
  peak = null,
}: {
  scale: Scale;
  bands: readonly Band[];
  value: number | null;
  tone: Tone;
  stale: boolean;
  peak?: number | null;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      testID="gauge-bar"
      style={styles.frame}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.track}>
        {bands.map((band) => {
          const from = scaleFraction(band.from, scale);
          const to = scaleFraction(band.to, scale);
          return (
            <View
              key={band.colour}
              testID={`gauge-band-${band.colour}`}
              style={[
                styles.band,
                {
                  left: percent(from),
                  width: percent(to - from),
                  backgroundColor: bandColour(theme, band.colour, stale),
                },
              ]}
            />
          );
        })}
      </View>
      {scale.redline === null ? null : (
        <View
          testID="gauge-redline"
          style={[
            styles.tick,
            {
              left: percent(scaleFraction(scale.redline, scale)),
              backgroundColor: bandColour(theme, 'red', stale),
            },
          ]}
        />
      )}
      {peak === null ? null : (
        <View
          testID="gauge-peak"
          style={[
            styles.tick,
            {
              left: percent(scaleFraction(peak, scale)),
              backgroundColor: toneColour(theme, 'normal', stale),
            },
          ]}
        />
      )}
      {value === null ? null : (
        <View
          testID="gauge-pointer"
          style={[
            styles.pointer,
            {
              left: percent(scaleFraction(value, scale)),
              backgroundColor: toneColour(theme, tone, stale),
            },
          ]}
        />
      )}
    </View>
  );
}
