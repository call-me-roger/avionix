import React from 'react';
import { Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/theme-context';

/** Test hook: how many times each instrument face rendered (the memoisation test reads it). */
export const instrumentRenders: Record<string, number> = {};

export function countRender(testID: string): void {
  instrumentRenders[testID] = (instrumentRenders[testID] ?? 0) + 1;
}

/** Which instrument colour draws each speed band, shared by the airspeed dial and the tape. */
export const ARC_COLOR = { white: 'arcWhite', green: 'arcGreen', yellow: 'arcYellow' } as const;

type SvgFont = { fontFamily?: string };

/** A family prop only once named: until the fonts load the system font draws, with no warning. */
const family = (name: string | undefined): SvgFont =>
  name === undefined ? {} : { fontFamily: name };

/**
 * The cockpit faces for SVG text, spread onto each `SvgText`: B612 Mono for numbers, B612 for
 * letters such as the cardinals N, E, S and W.
 */
export function useSvgFonts(): { digits: SvgFont; letters: SvgFont } {
  const { fonts } = useTheme().typography;
  return { digits: family(fonts.monoBold), letters: family(fonts.avionicsBold) };
}

/** A heading card's label: a number of tens, or a cardinal letter. */
export function cardLabelFont(
  label: string,
  fonts: { digits: SvgFont; letters: SvgFont },
): SvgFont {
  return /^\d+$/.test(label) ? fonts.digits : fonts.letters;
}

/**
 * A PFD target bug on a vertical tape: 6 wide and 12 tall against the tape's edge at `edge`,
 * notched at the edge so the target's line reads through it. `inward` is +1 for a left edge, −1 for
 * a right one.
 */
export function tapeBugPoints(edge: number, inward: 1 | -1, y: number): string {
  const body = edge + 6 * inward;
  const notch = edge + 3 * inward;
  return `${edge},${y - 6} ${body},${y - 6} ${body},${y + 6} ${edge},${y + 6} ${notch},${y}`;
}

/** A boxed number, centred on `x`, baseline-centred on `y`. */
export function DigitalWindow({
  x,
  y,
  width,
  text,
  fontSize = 18,
}: {
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize?: number;
}) {
  const ink = useTheme().instrument;
  const { digits } = useSvgFonts();
  const height = fontSize + 8;
  return (
    <>
      <Rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        fill={ink.face}
        stroke={ink.marking}
        strokeWidth={1.5}
        rx={3}
      />
      <SvgText
        x={x}
        y={y + fontSize * 0.35}
        fontSize={fontSize}
        fontWeight="bold"
        fill={ink.marking}
        textAnchor="middle"
        {...digits}
      >
        {text}
      </SvgText>
    </>
  );
}
