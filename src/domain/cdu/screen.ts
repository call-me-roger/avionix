import { decodeDataRefBytes, decodeUtf8Bytes } from '@/domain/simulator/dataref-string';
import type { DataRefValue } from '@/domain/simulator/types';

/** The default FMS screen (F-32 spec §4.2–4.3): 24 columns, rows 0–13 plus two spare lines. */
export const CDU_COLUMNS = 24;
export const CDU_BASE_ROWS = 14;
export const SCRATCHPAD_ROW = 13;
/** Large white: what a cell without a readable style byte is drawn as. */
export const DEFAULT_STYLE = 0x87;

export type CduColour = 'white' | 'cyan' | 'red' | 'yellow' | 'green' | 'magenta' | 'amber';

export interface CduCellStyle {
  colour: CduColour;
  large: boolean;
  reverse: boolean;
  flash: boolean;
  underline: boolean;
}

export interface CduCell extends CduCellStyle {
  char: string;
}

// Laminar: 0 black, 1 cyan, 2 red, 3 yellow, 4 green, 5 magenta, 6 amber, 7 white.
const COLOURS: readonly (CduColour | null)[] = [
  null,
  'cyan',
  'red',
  'yellow',
  'green',
  'magenta',
  'amber',
  'white',
];

/**
 * Bit 7 large, 6 reverse video, 5 flashing, 4 underscore, 0–3 colour. Black and unknown colours
 * draw white: black glyphs on the black glass would be invisible. Black reverse video is plain text.
 */
export function decodeStyleByte(byte: number): CduCellStyle {
  const index = byte & 0x0f;
  const colour = COLOURS[index] ?? 'white';
  return {
    colour,
    large: (byte & 0x80) !== 0,
    reverse: (byte & 0x40) !== 0 && index !== 0,
    flash: (byte & 0x20) !== 0,
    underline: (byte & 0x10) !== 0,
  };
}

/** 24 cells of text, one glyph each, or null when the value is missing or undecodable. */
export function decodeTextLine(value: DataRefValue | undefined): string[] | null {
  const bytes = decodeDataRefBytes(value);
  if (bytes === null) {
    return null;
  }
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }
  const glyphs = Array.from(decodeUtf8Bytes(bytes.subarray(0, end)).replace(/\u0000/g, ' '));
  const cells = glyphs.slice(0, CDU_COLUMNS);
  while (cells.length < CDU_COLUMNS) {
    cells.push(' ');
  }
  return cells;
}

/** 24 style bytes; anything missing reads as DEFAULT_STYLE. */
export function decodeStyleLine(value: DataRefValue | undefined): number[] {
  const bytes = decodeDataRefBytes(value) ?? new Uint8Array(0);
  return Array.from({ length: CDU_COLUMNS }, (_, index) => bytes[index] ?? DEFAULT_STYLE);
}

export function cduCells(text: readonly string[], style: readonly number[]): CduCell[] {
  return Array.from({ length: CDU_COLUMNS }, (_, index) => ({
    char: text[index] ?? ' ',
    ...decodeStyleByte(style[index] ?? DEFAULT_STYLE),
  }));
}

export function isBlankLine(text: readonly string[]): boolean {
  return text.every((char) => char.trim() === '');
}

const SPOKEN_GLYPHS: Record<string, string> = {
  '☐': ' box ',
  '←': ' left arrow ',
  '→': ' right arrow ',
  '↑': ' up arrow ',
  '↓': ' down arrow ',
  '°': ' degrees ',
  Δ: ' delta ',
  '⬡': ' hexagon ',
  '◀': ' left ',
  '▶': ' right ',
};

/** The line as a screen reader should say it: glyphs in words, spaces collapsed. */
export function spokenLine(text: readonly string[]): string {
  return text
    .map((char) => SPOKEN_GLYPHS[char] ?? char)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
