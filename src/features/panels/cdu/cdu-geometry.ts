/**
 * The CDU glass's fixed-width cell grid (F-32 spec §4.3, §4.7). The glass is always 24 columns
 * wide; everything else — font size, small font, row height — follows from how wide one cell is.
 */

/** A pressable's shortest side (theme.touch.minTarget): an LSK column is never narrower. */
export const LSK_COLUMN = 48;
/** Two rows share one 48 dp LSK, so a row never drops below half of it. */
export const MIN_ROW_HEIGHT = 24;
/** B612 Mono's advance width per em (1229/2048, rounded). */
export const MONO_ADVANCE = 0.6;
/** A cell never grows past this on a very wide glass — a huge CDU would look like a slide, not a box. */
export const MAX_CELL_WIDTH = 22;
/** Small font is this fraction of large font, on the same baseline. */
export const SMALL_SCALE = 0.8;

export interface CduGeometry {
  cellWidth: number;
  fontSize: number;
  smallFontSize: number;
  rowHeight: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The grid for a glass `glassWidth` dp wide: 24 cells, capped so the font never grows unbounded. */
export function cduGeometry(glassWidth: number): CduGeometry {
  const cellWidth = Math.min(MAX_CELL_WIDTH, Math.floor((glassWidth / 24) * 10) / 10);
  const fontSize = round1(cellWidth / MONO_ADVANCE);
  const smallFontSize = round1(fontSize * SMALL_SCALE);
  const rowHeight = Math.max(MIN_ROW_HEIGHT, Math.round(fontSize * 1.15));
  return { cellWidth, fontSize, smallFontSize, rowHeight };
}

/** LSK `k` (1–6) spans the label row above and the data row below: rows `2k−1` and `2k`. */
export function lskRows(lsk: number): [number, number] {
  return [2 * lsk - 1, 2 * lsk];
}
