import React from 'react';
import { Rect, Text as SvgText } from 'react-native-svg';

import { useSvgFonts } from '@/features/panels/instruments/svg-parts';
import { useTheme } from '@/theme/theme-context';

/** The HSI's corner-text size, which its flags share. */
const FLAG_TEXT_SIZE = 12;

/**
 * A red flag box with its word, centred on (x, y), drawn inside an SVG: failure flags are words on
 * red (U2). The HSI and the PFD's navigation cues both draw it.
 */
export function Flag({
  testID,
  x,
  y,
  word,
}: {
  testID: string;
  x: number;
  y: number;
  word: string;
}) {
  const ink = useTheme().instrument;
  const { letters } = useSvgFonts();
  const width = word.length * 9 + 10;
  return (
    <>
      <Rect
        testID={`${testID}-box`}
        x={x - width / 2}
        y={y - 8}
        width={width}
        height={16}
        rx={2}
        fill={ink.flag}
      />
      <SvgText
        testID={testID}
        x={x}
        y={y + 4.5}
        fontSize={FLAG_TEXT_SIZE}
        fontWeight="bold"
        fill={ink.flagText}
        textAnchor="middle"
        {...letters}
      >
        {word}
      </SvgText>
    </>
  );
}
