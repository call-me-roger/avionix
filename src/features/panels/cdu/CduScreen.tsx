import React, { createContext, useContext, useEffect, useState } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import {
  SCRATCHPAD_ROW,
  type CduCell,
  cduCells,
  isBlankLine,
  spokenLine,
} from '@/domain/cdu/screen';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { numeric } from '@/theme/typography';

import type { CduGeometry } from './cdu-geometry';
import type { CduScreenValues } from './useCduScreen';

/** How often the glass's flashing cells toggle (spec §4.3: "a shared 1 Hz clock", on then off). */
const BLINK_MS = 500;

/**
 * Whether `on` (lit) or not: provided by `CduScreen` so only the cells that actually flash read it
 * and re-render on the blink tick (spec §4.3 R4) — a row with no flashing cell never sees this.
 */
const CduBlinkContext = createContext(true);

const makeStyles = (theme: Theme) => ({
  root: {
    backgroundColor: theme.cdu.glass,
    borderWidth: 1,
    borderColor: theme.cdu.screenEdge,
  },
  row: {
    flexDirection: 'row' as const,
  },
  cell: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  underline: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: 1.5,
  },
  text: {
    includeFontPadding: false,
  },
});

/** True once any row currently drawn carries a flashing cell (style bit 5): the only time the
 * blink clock needs to run (spec §4.3: "runs only while a flashing cell is on screen"). */
function hasFlashingCell(rows: CduScreenValues['rows']): boolean {
  return rows.some((row) =>
    Array.from(row.style).some((char) => (char.charCodeAt(0) & 0x20) !== 0),
  );
}

/** A flashing glyph: the only part of a row that re-renders on the blink tick. */
function FlashGlyph({ style, children }: { style: StyleProp<TextStyle>; children: string }) {
  const on = useContext(CduBlinkContext);
  return <Text style={[style, { opacity: on ? 1 : 0 }]}>{children}</Text>;
}

function CduCellView({
  row,
  col,
  cell,
  geometry,
}: {
  row: number;
  col: number;
  cell: CduCell;
  geometry: CduGeometry;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const glyphColour = theme.cdu[cell.colour];
  // Reverse video draws the glyph (and so the underline that joins it) in the glass colour, on a
  // fill of the cell's own colour; a plain cell draws both in its own colour.
  const textColour = cell.reverse ? theme.cdu.glass : glyphColour;
  const fontSize = cell.large ? geometry.fontSize : geometry.smallFontSize;
  const textStyle: StyleProp<TextStyle> = [
    numeric(theme),
    styles.text,
    { fontSize, color: textColour },
  ];
  return (
    <View
      testID={`cdu-cell-${row}-${col}`}
      style={[
        styles.cell,
        { width: geometry.cellWidth, height: geometry.rowHeight },
        cell.reverse ? { backgroundColor: glyphColour } : null,
      ]}
    >
      {cell.char === ' ' ? null : cell.flash ? (
        <FlashGlyph style={textStyle}>{cell.char}</FlashGlyph>
      ) : (
        <Text style={textStyle}>{cell.char}</Text>
      )}
      {cell.underline ? (
        <View
          testID={`cdu-underline-${row}-${col}`}
          style={[styles.underline, { backgroundColor: textColour }]}
        />
      ) : null}
    </View>
  );
}

/**
 * Counts `CduRow`'s own renders, nothing else: exported only so the R4 memo test can see that
 * changing one row's text/style re-renders that row alone.
 */
export const __cduRowRenders = { count: 0 };

function countCduRowRender(): void {
  __cduRowRenders.count += 1;
}

interface RowProps {
  index: number;
  text: string;
  style: string;
  geometry: CduGeometry;
}

/**
 * One drawn row, memoised on `text` and `style` (both primitives, so a change elsewhere on the
 * glass never re-renders this row — spec §4.3 R4). `geometry` is expected stable for the screen's
 * lifetime (it only changes when the glass itself is resized).
 */
const CduRow = React.memo(function CduRow({ index, text, style, geometry }: RowProps) {
  countCduRowRender();
  const styles = useThemedStyles(makeStyles);
  const chars = Array.from(text);
  const styleBytes = Array.from(style, (char) => char.charCodeAt(0));
  const cells = cduCells(chars, styleBytes);
  const blank = isBlankLine(chars);
  const isScratchpad = index === SCRATCHPAD_ROW;
  const hidden = blank && !isScratchpad;
  const spoken = spokenLine(chars);
  const label = isScratchpad ? (blank ? 'Scratchpad empty' : `Scratchpad, ${spoken}`) : spoken;

  return (
    <View
      testID={`cdu-row-${index}`}
      style={[styles.row, { height: geometry.rowHeight }]}
      accessible={!hidden}
      accessibilityLabel={hidden ? undefined : label}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {cells.map((cell, col) => (
        <CduCellView key={col} row={index} col={col} cell={cell} geometry={geometry} />
      ))}
    </View>
  );
});

/**
 * The CDU glass: a fixed grid of cells mirroring exactly what X-Plane sent (C1 — no local echo, no
 * computed text). Dims to 50 % while stale (C5); the "NOT LIVE" tag and the keys are the caller's
 * job, since this component only ever draws rows.
 */
export function CduScreen(props: {
  rows: CduScreenValues['rows'];
  geometry: CduGeometry;
  stale: boolean;
  testID?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const reducedMotion = useReducedMotion();
  const [on, setOn] = useState(true);
  const flashing = !reducedMotion && hasFlashingCell(props.rows);

  useEffect(() => {
    if (!flashing) {
      return undefined;
    }
    const interval = setInterval(() => {
      setOn((value) => !value);
    }, BLINK_MS);
    return () => clearInterval(interval);
  }, [flashing]);

  // Steady lit whenever nothing should be toggling: `on`'s own value is stale the moment flashing
  // stops (the interval that drove it is already gone), so this reads directly, never from state.
  const blinkOn = flashing ? on : true;

  return (
    <View
      testID={props.testID ?? 'cdu-screen'}
      style={[styles.root, { opacity: props.stale ? 0.5 : 1 }]}
    >
      <CduBlinkContext.Provider value={blinkOn}>
        {props.rows.map((row, index) => (
          <CduRow
            key={index}
            index={index}
            text={row.text}
            style={row.style}
            geometry={props.geometry}
          />
        ))}
      </CduBlinkContext.Provider>
    </View>
  );
}
