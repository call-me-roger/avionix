/**
 * The CDU glass's fixed-width cell grid (F-32 spec §4.3, §4.7). The glass is always 24 columns
 * wide; everything else — font size, small font, row height — follows from how wide one cell is.
 */

/** A pressable's shortest side (theme.touch.minTarget): an LSK column is never narrower. */
export const LSK_COLUMN = 48;
/** Two rows share one 48 dp LSK, so a row never drops below half of it. */
export const MIN_ROW_HEIGHT = 24;
/**
 * B612 Mono's advance width per em: the bundled font's hmtx advance width is 1300 of 2000
 * units/em (not 1229/2048 — that was the wrong font's metrics).
 */
export const MONO_ADVANCE = 0.65;
/** A cell never grows past this on a very wide glass — a huge CDU would look like a slide, not a box. */
export const MAX_CELL_WIDTH = 22;
/** Small font is this fraction of large font, on the same baseline. */
export const SMALL_SCALE = 0.8;
/**
 * B612 Mono's hhea ascender, 1930 of 2000 units/em. OS/2's USE_TYPO_METRICS flag is off in the
 * bundled font, so both iOS (`UIFont.ascender`) and Android (`Paint.FontMetricsInt.ascent`) read
 * this table, not OS/2's. Used, with FONT_DESCENT, to put small and large glyphs on one baseline.
 */
export const FONT_ASCENT = 0.965;
/** B612 Mono's hhea descender, 500 of 2000 units/em (stored here as a positive em fraction). */
export const FONT_DESCENT = 0.25;

export interface CduGeometry {
  cellWidth: number;
  fontSize: number;
  smallFontSize: number;
  rowHeight: number;
  /**
   * How far down a small glyph must move (a `translateY`) to land on the same baseline as a large
   * glyph once both are centred in the same cell (spec §4.3 "on the same baseline"). 0 is correct
   * for the large glyph itself, which needs no shift.
   */
  smallBaselineShift: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The grid for a glass `glassWidth` dp wide: 24 cells, capped so the font never grows unbounded. */
export function cduGeometry(glassWidth: number): CduGeometry {
  const cellWidth = Math.min(MAX_CELL_WIDTH, Math.floor((glassWidth / 24) * 10) / 10);
  const fontSize = round1(cellWidth / MONO_ADVANCE);
  const smallFontSize = round1(fontSize * SMALL_SCALE);
  // 1.25, a hair above the font's own 1.215 em (FONT_ASCENT + FONT_DESCENT) line height, so a
  // large glyph's full ascent/descent box never touches the row above or below.
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.round(fontSize * 1.25));
  const smallBaselineShift = round1(
    ((FONT_ASCENT - FONT_DESCENT) / 2) * (fontSize - smallFontSize),
  );
  return { cellWidth, fontSize, smallFontSize, rowHeight, smallBaselineShift };
}

/** LSK `k` (1–6) spans the label row above and the data row below: rows `2k−1` and `2k`. */
export function lskRows(lsk: number): [number, number] {
  return [2 * lsk - 1, 2 * lsk];
}
