import type { Airport, MapCell, Runway } from '@/domain/map/map-data';
import { MAX_LABELS, buildLayers } from '@/features/panels/map/map-layers';

const ANCHOR = { lat: 0, lon: 0 };
const EVERY = { minAirportFt: 0, minLabelFt: 0 };
/** A reach no test point comes near: nothing is culled by distance. */
const FAR = 10_000;

function cell(airports: Airport[], runways: Runway[] = []): MapCell {
  return { land: [], lakes: [], borders: [], airports, runways };
}

/** `count` airports due north of the anchor, 0.6 nm apart, listed farthest first. */
function airportsNorth(count: number): Airport[] {
  return Array.from({ length: count }, (_, i) => ({
    ident: `A${i}`,
    position: { lat: (i + 1) * 0.01, lon: 0 },
    longestFt: 4000,
  })).reverse();
}

describe('buildLayers', () => {
  it('keeps the nearest identifiers when a dense area has more than the cap', () => {
    const layers = buildLayers([cell(airportsNorth(70))], ['0:0'], ANCHOR, EVERY, 10, FAR);
    expect(MAX_LABELS).toBe(60);
    expect(layers.labels).toHaveLength(60);
    const idents = new Set(layers.labels.map((label) => label.ident));
    for (let i = 0; i < 60; i += 1) {
      expect(idents.has(`A${i}`)).toBe(true);
    }
    for (let i = 60; i < 70; i += 1) {
      expect(idents.has(`A${i}`)).toBe(false);
    }
  });

  it('draws no identifiers where the density draws none', () => {
    const layers = buildLayers(
      [cell(airportsNorth(3))],
      ['0:0'],
      ANCHOR,
      { minAirportFt: 0, minLabelFt: null },
      10,
      FAR,
    );
    expect(layers.labels).toEqual([]);
  });

  it('skips the runways of an airport shorter than the density allows', () => {
    const airports: Airport[] = [
      { ident: 'SHORT', position: { lat: 0.01, lon: 0 }, longestFt: 2000 },
      { ident: 'LONG', position: { lat: 0.02, lon: 0 }, longestFt: 8000 },
    ];
    const runways: Runway[] = [
      {
        airport: 0,
        ends: [
          { lat: 0.01, lon: 0 },
          { lat: 0.015, lon: 0 },
        ],
        widthFt: 75,
      },
      {
        airport: 1,
        ends: [
          { lat: 0.02, lon: 0 },
          { lat: 0.03, lon: 0 },
        ],
        widthFt: 150,
      },
    ];
    const layers = buildLayers(
      [cell(airports, runways)],
      ['3:4'],
      ANCHOR,
      { minAirportFt: 3000, minLabelFt: 5000 },
      10,
      FAR,
    );
    expect(layers.runways.map((runway) => runway.key)).toEqual(['3:4/1']);
    expect(layers.labels.map((label) => label.ident)).toEqual(['LONG']);
  });

  it('never draws a runway thinner than 2 px', () => {
    const airports: Airport[] = [{ ident: 'X', position: ANCHOR, longestFt: 3000 }];
    const runways: Runway[] = [{ airport: 0, ends: [ANCHOR, { lat: 0.01, lon: 0 }], widthFt: 50 }];
    const layers = buildLayers([cell(airports, runways)], ['0:0'], ANCHOR, EVERY, 10, FAR);
    expect(layers.runways[0]!.width).toBeCloseTo(0.2, 10);
  });

  it('projects outlines into path strings around the anchor, closing only the areas', () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
    ];
    const outlines: MapCell = { ...cell([]), land: [square], borders: [square] };
    const layers = buildLayers([outlines], ['0:0'], ANCHOR, EVERY, 10, FAR);
    expect(layers.land).toBe('M0 0L60 0L60 -60Z');
    expect(layers.borders).toBe('M0 0L60 0L60 -60');
    expect(layers.lakes).toBe('');
  });

  it('draws only the runways and identifiers within reach of the anchor', () => {
    // 0.1° of latitude is 6 nm: with a 10 nm reach, A is in, B is out, C crosses the anchor.
    const airports: Airport[] = [
      { ident: 'NEAR', position: { lat: 0.1, lon: 0 }, longestFt: 8000 },
      { ident: 'FARAWAY', position: { lat: 1, lon: 0 }, longestFt: 8000 },
      { ident: 'ACROSS', position: { lat: 0, lon: 0.3 }, longestFt: 8000 },
    ];
    const runways: Runway[] = [
      {
        airport: 0,
        ends: [
          { lat: 0.1, lon: 0 },
          { lat: 0.2, lon: 0 },
        ],
        widthFt: 150,
      },
      {
        airport: 1,
        ends: [
          { lat: 1, lon: 0 },
          { lat: 1.05, lon: 0 },
        ],
        widthFt: 150,
      },
      // One end within reach is enough.
      {
        airport: 0,
        ends: [
          { lat: 0.15, lon: 0 },
          { lat: 0.5, lon: 0 },
        ],
        widthFt: 150,
      },
      // Both ends beyond reach, but the runway runs through it.
      {
        airport: 2,
        ends: [
          { lat: 0, lon: -0.2 },
          { lat: 0, lon: 0.2 },
        ],
        widthFt: 150,
      },
    ];
    const layers = buildLayers([cell(airports, runways)], ['0:0'], ANCHOR, EVERY, 10, 10);
    expect(layers.runways.map((runway) => runway.key)).toEqual(['0:0/0', '0:0/2', '0:0/3']);
    expect(layers.labels.map((label) => label.ident)).toEqual(['NEAR']);
  });

  it('keeps an outline continuous where it crosses the far side of a pole', () => {
    // Near the South Pole every column is drawn, so a ring can straddle anchor.lon ± 180°.
    const anchor = { lat: -88, lon: 166.7 };
    const seam = anchor.lon - 180;
    const ring = [
      { lat: -87, lon: seam + 1 },
      { lat: -87, lon: seam - 1 },
      { lat: -86, lon: seam - 1 },
      { lat: -86, lon: seam + 1 },
    ];
    const outlines: MapCell = { ...cell([]), land: [ring], borders: [ring] };
    const layers = buildLayers([outlines], ['-18:-3'], anchor, EVERY, 10, FAR);
    for (const d of [layers.land, layers.borders]) {
      const xs = [...d.matchAll(/[ML](-?[\d.]+) /g)].map((match) => Number(match[1]));
      expect(xs).toHaveLength(4);
      // 2° of longitude at 88° south is about 4.2 nm, not the ~750 nm of a jump across the map.
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(5);
    }
  });
});
