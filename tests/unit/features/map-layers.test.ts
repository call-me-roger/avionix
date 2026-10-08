import type { Airport, MapCell, Runway } from '@/domain/map/map-data';
import { MAX_LABELS, buildLayers } from '@/features/panels/map/map-layers';

const ANCHOR = { lat: 0, lon: 0 };
const EVERY = { minAirportFt: 0, minLabelFt: 0 };

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
    const layers = buildLayers([cell(airportsNorth(70))], ['0:0'], ANCHOR, EVERY, 10);
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
    );
    expect(layers.runways.map((runway) => runway.key)).toEqual(['3:4/1']);
    expect(layers.labels.map((label) => label.ident)).toEqual(['LONG']);
  });

  it('never draws a runway thinner than 2 px', () => {
    const airports: Airport[] = [{ ident: 'X', position: ANCHOR, longestFt: 3000 }];
    const runways: Runway[] = [{ airport: 0, ends: [ANCHOR, { lat: 0.01, lon: 0 }], widthFt: 50 }];
    const layers = buildLayers([cell(airports, runways)], ['0:0'], ANCHOR, EVERY, 10);
    expect(layers.runways[0]!.width).toBeCloseTo(0.2, 10);
  });

  it('projects outlines into path strings around the anchor, closing only the areas', () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
    ];
    const outlines: MapCell = { ...cell([]), land: [square], borders: [square] };
    const layers = buildLayers([outlines], ['0:0'], ANCHOR, EVERY, 10);
    expect(layers.land).toBe('M0 0L60 0L60 -60Z');
    expect(layers.borders).toBe('M0 0L60 0L60 -60');
    expect(layers.lakes).toBe('');
  });
});
