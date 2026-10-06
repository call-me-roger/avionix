import { MAX_CELL_WIDTH, cduGeometry, lskRows } from '@/features/panels/cdu/cdu-geometry';

describe('cduGeometry', () => {
  it('fits a typical tablet glass', () => {
    const geometry = cduGeometry(312);
    expect(geometry.cellWidth).toBe(13);
    expect(geometry.fontSize).toBe(21.7);
    expect(geometry.smallFontSize).toBe(17.4);
    expect(geometry.rowHeight).toBe(25);
  });

  it('floors the cell width to one decimal on a narrow glass, and floors the row height at 24', () => {
    const geometry = cduGeometry(200);
    expect(geometry.cellWidth).toBe(8.3);
    expect(geometry.rowHeight).toBe(24);
  });

  it('caps the cell width on a huge glass', () => {
    const geometry = cduGeometry(1000);
    expect(geometry.cellWidth).toBe(MAX_CELL_WIDTH);
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
