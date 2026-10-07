import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import type { GaugeReading } from '@/domain/engines/engine-page';
import { scaleFraction } from '@/domain/engines/markings';
import { arcPath, dialHeight, dialPoint } from '@/features/panels/engines/dial-geometry';
import { bandColour, toneColour } from '@/features/panels/engines/tone';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const makeStyles = (theme: Theme) => ({
  root: { alignItems: 'center' as const },
  value: {
    ...avionicsText(theme, true),
    position: 'absolute' as const,
    left: 0,
    right: 0,
    textAlign: 'center' as const,
  },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
    letterSpacing: 1,
  },
});

/**
 * An engine's primary gauge as an arc dial (spec §4.10): the aircraft's bands, a redline tick
 * where there is one, the needle and the number in the reading's tone. Pilots miss "glancing at a
 * needle out of the corner of my eye" on all-digital monitors (research §1). One accessible
 * element, spoken as the reading.
 */
export function GaugeDial({
  reading,
  size,
  stale,
}: {
  reading: GaugeReading;
  size: number;
  stale: boolean;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stroke = Math.max(4, Math.round(size / 18));
  const centre = size / 2;
  const radius = centre - stroke;
  const { scale } = reading;
  const at = (value: number): number => (scale === null ? 0 : scaleFraction(value, scale));
  const colour = toneColour(theme, reading.tone, stale);
  const fontSize = Math.min(28, Math.max(14, Math.round(size * 0.16)));
  const lineHeight = Math.round(fontSize * 1.25);
  const height = Math.max(dialHeight(size), Math.ceil(centre + stroke + lineHeight));
  const needle =
    scale !== null && reading.value !== null
      ? dialPoint(centre, centre, radius - stroke, at(reading.value))
      : null;
  const redline = scale?.redline ?? null;
  const redlineInner =
    redline === null ? null : dialPoint(centre, centre, radius - stroke, at(redline));
  const redlineOuter =
    redline === null ? null : dialPoint(centre, centre, radius + stroke / 2, at(redline));

  return (
    <View
      testID={`dial-${reading.engine}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={reading.spoken}
      style={[styles.root, { width: size }]}
    >
      <View testID={`dial-face-${reading.engine}`} style={{ width: size, height }}>
        <Svg width={size} height={height}>
          <Path
            d={arcPath(centre, centre, radius, 0, 1)}
            stroke={theme.avionics.lightOff}
            strokeWidth={stroke}
            fill="none"
          />
          {scale === null
            ? null
            : reading.bands.map((band) => (
                <Path
                  key={band.colour}
                  testID={`dial-band-${band.colour}`}
                  d={arcPath(centre, centre, radius, at(band.from), at(band.to))}
                  stroke={bandColour(theme, band.colour, stale)}
                  strokeWidth={stroke}
                  fill="none"
                />
              ))}
          {redlineInner === null || redlineOuter === null ? null : (
            <Line
              testID="dial-redline"
              x1={redlineInner.x}
              y1={redlineInner.y}
              x2={redlineOuter.x}
              y2={redlineOuter.y}
              stroke={bandColour(theme, 'red', stale)}
              strokeWidth={3}
            />
          )}
          {needle === null ? null : (
            <Line
              testID="dial-needle"
              x1={centre}
              y1={centre}
              x2={needle.x}
              y2={needle.y}
              stroke={colour}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <Text
          testID={`dial-value-${reading.engine}`}
          style={[styles.value, { top: centre + stroke, fontSize, lineHeight, color: colour }]}
        >
          {reading.text}
        </Text>
      </View>
      <Text style={styles.legend}>{reading.legend}</Text>
    </View>
  );
}
