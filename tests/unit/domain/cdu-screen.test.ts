import {
  CDU_COLUMNS,
  DEFAULT_STYLE,
  cduCells,
  decodeStyleByte,
  decodeStyleLine,
  decodeTextLine,
  isBlankLine,
  spokenLine,
} from '@/domain/cdu/screen';
import { text, style } from '../../helpers/cdu';

describe('decodeTextLine', () => {
  it('decodes UTF-8, drops trailing NULs and pads to 24 cells', () => {
    const cells = decodeTextLine(text(' ORIGIN'));
    expect(cells).toHaveLength(CDU_COLUMNS);
    expect(cells?.join('')).toBe(' ORIGIN'.padEnd(24, ' '));
  });

  it('keeps one cell per glyph for multi-byte characters', () => {
    const cells = decodeTextLine(text('☐☐☐☐ 270°/15'));
    expect(cells?.slice(0, 12)).toEqual([
      '☐',
      '☐',
      '☐',
      '☐',
      ' ',
      '2',
      '7',
      '0',
      '°',
      '/',
      '1',
      '5',
    ]);
  });

  it('cuts at 24 cells and turns interior NULs into spaces', () => {
    expect(decodeTextLine(text('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))?.join('')).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWX',
    );
    const withNul = Buffer.from([0x41, 0x00, 0x42]).toString('base64');
    expect(decodeTextLine(withNul)?.slice(0, 3)).toEqual(['A', ' ', 'B']);
  });

  it('returns null for a missing or undecodable value, never raw base64', () => {
    expect(decodeTextLine(undefined)).toBeNull();
    expect(decodeTextLine(42)).toBeNull();
    expect(decodeTextLine('not base64!')).toBeNull();
  });

  it('reads an empty line as 24 spaces', () => {
    expect(decodeTextLine(text(''))?.join('')).toBe(' '.repeat(24));
  });
});

describe('style decoding', () => {
  it('decodes the bits Laminar documents', () => {
    expect(decodeStyleByte(0x80 | 0x40 | 0x20 | 0x10 | 4)).toEqual({
      colour: 'green',
      large: true,
      reverse: true,
      flash: true,
      underline: true,
    });
    expect(decodeStyleByte(1).colour).toBe('cyan');
    expect(decodeStyleByte(2).colour).toBe('red');
    expect(decodeStyleByte(3).colour).toBe('yellow');
    expect(decodeStyleByte(5).colour).toBe('magenta');
    expect(decodeStyleByte(6).colour).toBe('amber');
    expect(decodeStyleByte(7)).toEqual({
      colour: 'white',
      large: false,
      reverse: false,
      flash: false,
      underline: false,
    });
  });

  it('renders black and unknown colours as white, and black reverse video as plain text', () => {
    expect(decodeStyleByte(0x80).colour).toBe('white');
    expect(decodeStyleByte(0x40).reverse).toBe(false);
    expect(decodeStyleByte(0x0b).colour).toBe('white');
    expect(decodeStyleByte(0x4b).reverse).toBe(true);
  });

  it('pads a short style line and defaults a missing one to large white', () => {
    expect(decodeStyleLine(style([1, 2]))).toEqual([1, 2, ...Array(22).fill(DEFAULT_STYLE)]);
    expect(decodeStyleLine(undefined)).toEqual(Array(24).fill(DEFAULT_STYLE));
    expect(decodeStyleLine('***')).toEqual(Array(24).fill(DEFAULT_STYLE));
  });

  it('keeps a style byte of 0 (it is not a terminator)', () => {
    expect(decodeStyleLine(style([0x81, 0, 0x84]))).toEqual([
      0x81,
      0,
      0x84,
      ...Array(21).fill(DEFAULT_STYLE),
    ]);
  });
});

describe('cells, blank lines and speech', () => {
  it('applies style i to glyph i', () => {
    const cells = cduCells(decodeTextLine(text('°A')) ?? [], [0x81, 0x84]);
    expect(cells[0]).toMatchObject({ char: '°', colour: 'cyan', large: true });
    expect(cells[1]).toMatchObject({ char: 'A', colour: 'green', large: true });
  });

  it('knows a blank line', () => {
    expect(isBlankLine(Array(24).fill(' '))).toBe(true);
    expect(isBlankLine(decodeTextLine(text('  X')) ?? [])).toBe(false);
  });

  it('speaks boxes, arrows and degrees in words', () => {
    expect(spokenLine(decodeTextLine(text('☐☐☐☐  270°')) ?? [])).toBe(
      'box box box box 270 degrees',
    );
    expect(spokenLine(decodeTextLine(text('<INDEX   ←→')) ?? [])).toBe(
      '<INDEX left arrow right arrow',
    );
  });
});
