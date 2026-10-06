import {
  FONT_ASCENT,
  FONT_DESCENT,
  MAX_CELL_WIDTH,
  cduGeometry,
  lskRows,
} from '@/features/panels/cdu/cdu-geometry';

describe('cduGeometry', () => {
  it('fits a typical tablet glass', () => {
    const geometry = cduGeometry(312);
    expect(geometry.cellWidth).toBe(13);
    expect(geometry.fontSize).toBe(20);
    expect(geometry.smallFontSize).toBe(16);
    expect(geometry.rowHeight).toBe(25);
  });

  it('floors the cell width to one decimal on a narrow glass, and floors the row height at 24', () => {
    const geometry = cduGeometry(200);
    expect(geometry.cellWidth).toBe(8.3);
    expect(geometry.fontSize).toBe(12.8);
    expect(geometry.rowHeight).toBe(24);
  });

  it('caps the cell width on a huge glass', () => {
    const geometry = cduGeometry(1000);
    expect(geometry.cellWidth).toBe(MAX_CELL_WIDTH);
  });

  it("shifts the small glyph down by half the font's ascent-descent spread times the size gap", () => {
    const geometry = cduGeometry(312);
    // (FONT_ASCENT - FONT_DESCENT) / 2 * (fontSize - smallFontSize) = 0.3575 * 4 = 1.43 -> 1.4.
    const expected =
      Math.round(
        ((FONT_ASCENT - FONT_DESCENT) / 2) * (geometry.fontSize - geometry.smallFontSize) * 10,
      ) / 10;
    expect(geometry.smallBaselineShift).toBe(expected);
    expect(geometry.smallBaselineShift).toBe(1.4);
  });
});

describe('lskRows', () => {
  it('spans the label and data row of the first LSK', () => {
    expect(lskRows(1)).toEqual([1, 2]);
  });

  it('spans the label and data row of the last LSK', () => {
    expect(lskRows(6)).toEqual([11, 12]);
  });
});
