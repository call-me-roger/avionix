import {
  type BasemapFile,
  CELL_DEG,
  type RunwayFile,
  cellKey,
  cellOf,
  cellsAround,
  createMapData,
  decodeLine,
  wrapLongitude,
} from '@/domain/map/map-data';
import { bundledMapData } from '@/infrastructure/map/bundled-map-data';

const basemap: BasemapFile = {
  source: 'test outlines',
  quantum: 0.001,
  cellDeg: 5,
  cells: {
    '9:-25': {
      land: [[47000, -123000, 1000, 0, 0, 1000]],
      lakes: [],
      borders: [[47500, -122500, 10, 10]],
    },
  },
};
const runways: RunwayFile = {
  source: 'test runways',
  quantum: 0.00001,
  cellDeg: 5,
  cells: {
    '9:-25': {
      airports: [['KSEA', 4744900, -12230930, 11901]],
      runways: [[0, 4746400, -12230800, -3000, 0, 150]],
    },
  },
};

describe('cell maths', () => {
  it('wraps longitude into [-180, 180)', () => {
    expect(wrapLongitude(180)).toBe(-180);
    expect(wrapLongitude(-181)).toBe(179);
    expect(wrapLongitude(540)).toBe(-180);
    expect(wrapLongitude(12.5)).toBe(12.5);
  });

  it('puts a point in its 5° cell', () => {
    expect(CELL_DEG).toBe(5);
    expect(cellOf({ lat: 47.449, lon: -122.309 })).toEqual({ row: 9, col: -25 });
    expect(cellOf({ lat: -0.1, lon: 179.99 })).toEqual({ row: -1, col: 35 });
    expect(cellOf({ lat: 90, lon: 0 })).toEqual({ row: 17, col: 0 });
    expect(cellKey(9, -25)).toBe('9:-25');
  });

  it('selects the cells within a radius', () => {
    const keys = cellsAround({ lat: 47.449, lon: -122.309 }, 10);
    expect(keys).toContain('9:-25');
    expect(keys).toHaveLength(1);
  });

  it('wraps across the antimeridian', () => {
    const keys = cellsAround({ lat: -17.75, lon: 179.9 }, 60);
    expect(keys).toContain('-4:35');
    expect(keys).toContain('-4:-36');
  });

  it('takes every column near a pole', () => {
    const keys = cellsAround({ lat: 88, lon: 0 }, 200);
    expect(keys.filter((key) => key.startsWith('17:'))).toHaveLength(72);
  });
});

describe('decoding', () => {
  it('turns delta-encoded quantised pairs into points', () => {
    expect(decodeLine([47000, -123000, 1000, 0, 0, 1000], 0.001)).toEqual([
      { lat: 47, lon: -123 },
      { lat: 48, lon: -123 },
      { lat: 48, lon: -122 },
    ]);
  });

  it('decodes a cell once and caches it', () => {
    const data = createMapData(basemap, runways);
    const cell = data.cell('9:-25');
    expect(cell).toBe(data.cell('9:-25'));
    expect(cell.land).toHaveLength(1);
    expect(cell.borders[0]).toEqual([
      { lat: 47.5, lon: -122.5 },
      { lat: 47.51, lon: -122.49 },
    ]);
    expect(cell.airports).toEqual([
      { ident: 'KSEA', position: { lat: 47.449, lon: -122.3093 }, longestFt: 11901 },
    ]);
    expect(cell.runways[0]!.ends[1].lat).toBeCloseTo(47.434, 6);
    expect(cell.runways[0]!.widthFt).toBe(150);
    expect(data.sources).toEqual({ outlines: 'test outlines', runways: 'test runways' });
  });

  it('gives an empty cell for open ocean', () => {
    const data = createMapData(basemap, runways);
    expect(data.cell('0:0')).toEqual({
      land: [],
      lakes: [],
      borders: [],
      airports: [],
      runways: [],
    });
  });
});

describe('the committed snapshot', () => {
  const data = bundledMapData();

  it('stamps its sources', () => {
    expect(data.sources.outlines).toMatch(/^Natural Earth 1:50m .*fetched \d{4}-\d{2}-\d{2}$/);
    expect(data.sources.runways).toMatch(/^OurAirports .*fetched \d{4}-\d{2}-\d{2}$/);
  });

  it('has Seattle–Tacoma with its runways and land around it', () => {
    const cell = data.cell('9:-25');
    const ksea = cell.airports.findIndex((airport) => airport.ident === 'KSEA');
    expect(ksea).toBeGreaterThanOrEqual(0);
    expect(cell.runways.filter((runway) => runway.airport === ksea).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(cell.land.length).toBeGreaterThan(0);
  });

  it('has Heathrow', () => {
    const { row, col } = cellOf({ lat: 51.47, lon: -0.4543 });
    expect(data.cell(cellKey(row, col)).airports.some((airport) => airport.ident === 'EGLL')).toBe(
      true,
    );
  });

  it('clips every outline to its own cell', () => {
    for (const key of ['9:-25', '10:-1', '-7:30']) {
      const [row, col] = key.split(':').map(Number) as [number, number];
      const cell = data.cell(key);
      for (const ring of [...cell.land, ...cell.lakes, ...cell.borders]) {
        for (const point of ring) {
          expect(point.lat).toBeGreaterThanOrEqual(row * 5 - 0.001);
          expect(point.lat).toBeLessThanOrEqual((row + 1) * 5 + 0.001);
          expect(point.lon).toBeGreaterThanOrEqual(col * 5 - 0.001);
          expect(point.lon).toBeLessThanOrEqual((col + 1) * 5 + 0.001);
        }
      }
    }
  });
});
