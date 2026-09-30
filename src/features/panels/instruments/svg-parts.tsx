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
      >
        {text}
      </SvgText>
    </>
  );
}
