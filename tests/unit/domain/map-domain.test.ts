import { findFeature } from '@/domain/aircraft/profile';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import {
  DEFAULT_MAP_ORIENTATION,
  DEFAULT_MAP_RANGE,
  FEATURE_MOVING_MAP,
  MAP_DATAREFS as M,
  MAP_RANGES,
} from '@/domain/map/catalogue';
import { densityFor } from '@/domain/map/density';
import { chooseDirection } from '@/domain/map/direction';
import {
  formatGpsAltitude,
  formatPosition,
  rangeLabel,
  spokenPosition,
} from '@/domain/map/map-format';
import { type MapReader, mapModel } from '@/domain/map/map-model';
import { MAP_CREDIT, mapUnavailable } from '@/domain/map/messages';
import { distanceNm, project, rangeInNm, unproject } from '@/domain/map/projection';

describe('catalogue and profile 1.10.0', () => {
  it('declares the moving map: position required, the rest optional, nothing written', () => {
    expect(GENERIC_PROFILE.version).toBe('1.10.0');
    const feature = findFeature(GENERIC_PROFILE, FEATURE_MOVING_MAP);
    expect(feature?.label).toBe('Moving map');
    expect(feature?.bindings.map((binding) => [binding.name, binding.required])).toEqual([
      [M.latitude, true],
      [M.longitude, true],
      [M.elevation, false],
      [M.trueHeading, false],
      [M.trueTrack, false],
      [D.groundTrack, false],
      [D.groundSpeed, false],
    ]);
    expect(feature?.bindings.every((binding) => binding.kind === 'dataref' && !binding.write)).toBe(
      true,
    );
  });

  it('offers the ranges and defaults of the spec', () => {
    expect(MAP_RANGES).toEqual([2, 5, 10, 20, 40, 80, 160]);
    expect(DEFAULT_MAP_RANGE).toBe(10);
    expect(DEFAULT_MAP_ORIENTATION).toBe('north');
  });
});

describe('projection', () => {
  const sea = { lat: 47.449, lon: -122.309 };

  it('is nautical miles east and south of the anchor', () => {
    const p = project(sea, { lat: 48.449, lon: -122.309 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-60, 6);
    const q = project(sea, { lat: 47.449, lon: -121.309 });
    expect(q.x).toBeCloseTo(60 * Math.cos((47.449 * Math.PI) / 180), 6);
  });

  it('wraps across the antimeridian', () => {
    const p = project({ lat: -17, lon: 179.9 }, { lat: -17, lon: -179.9 });
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(12);
  });

  it('round-trips', () => {
    const point = { lat: 47.6, lon: -122.1 };
    const back = unproject(sea, project(sea, point));
    expect(back.lat).toBeCloseTo(point.lat, 9);
    expect(back.lon).toBeCloseTo(point.lon, 9);
  });

  it('measures great-circle distance', () => {
    expect(distanceNm(sea, { lat: 48.449, lon: -122.309 })).toBeCloseTo(60, 0);
    expect(distanceNm(sea, sea)).toBe(0);
  });

  it('converts a range to nautical miles', () => {
    expect(rangeInNm(10, 'nm')).toBe(10);
    expect(rangeInNm(10, 'km')).toBeCloseTo(5.3996, 3);
  });
});

describe('direction', () => {
  const both = { trueTrack: 90, trueHeading: 80 };

  it('uses track from 5 kt and keeps it down to 3 kt', () => {
    expect(chooseDirection({ ...both, groundSpeedKt: 5 }, false)).toEqual({
      source: 'track',
      degrees: 90,
    });
    expect(chooseDirection({ ...both, groundSpeedKt: 4 }, false)).toEqual({
      source: 'heading',
      degrees: 80,
    });
    expect(chooseDirection({ ...both, groundSpeedKt: 4 }, true)).toEqual({
      source: 'track',
      degrees: 90,
    });
    expect(chooseDirection({ ...both, groundSpeedKt: 2.9 }, true)).toEqual({
      source: 'heading',
      degrees: 80,
    });
  });

  it('falls back to whichever value exists', () => {
    expect(chooseDirection({ trueTrack: null, trueHeading: 80, groundSpeedKt: 120 }, true)).toEqual(
      {
        source: 'heading',
        degrees: 80,
      },
    );
    expect(chooseDirection({ trueTrack: 90, trueHeading: null, groundSpeedKt: 0 }, false)).toEqual({
      source: 'track',
      degrees: 90,
    });
    expect(
      chooseDirection({ trueTrack: null, trueHeading: null, groundSpeedKt: 120 }, false),
    ).toEqual({
      source: 'none',
      degrees: null,
    });
  });

  it('prefers heading when the speed is unknown', () => {
    expect(chooseDirection({ ...both, groundSpeedKt: null }, true)).toEqual({
      source: 'heading',
      degrees: 80,
    });
  });
});

describe('density', () => {
  it('thins runways and labels as the range grows', () => {
    expect(densityFor(3)).toEqual({ minAirportFt: 0, minLabelFt: 0 });
    expect(densityFor(4)).toEqual({ minAirportFt: 3000, minLabelFt: 5000 });
    expect(densityFor(5)).toEqual({ minAirportFt: 3000, minLabelFt: 5000 });
    expect(densityFor(6)).toEqual({ minAirportFt: 6000, minLabelFt: null });
  });
});

describe('formatting', () => {
  it('writes degrees and decimal minutes', () => {
    expect(formatPosition(47.452, -122.30883)).toBe('N47°27.12′ W122°18.53′');
    expect(formatPosition(-33.9461, 8.5)).toBe('S33°56.77′ E008°30.00′');
    expect(formatPosition(10.99999999, 0)).toBe('N11°00.00′ E000°00.00′');
  });

  it('speaks the position plainly', () => {
    expect(spokenPosition(47.452, -122.30883)).toBe('N 47 27.12, W 122 18.53');
  });

  it('gives GPS altitude in feet', () => {
    expect(formatGpsAltitude(132)).toBe('433 ft');
    expect(formatGpsAltitude(3048)).toBe('10,000 ft');
  });

  it('labels a range in the pilot’s unit', () => {
    expect(rangeLabel(10, 'nm')).toBe('10 nm');
    expect(rangeLabel(5, 'km')).toBe('5 km');
  });
});

function reader(
  values: Record<string, number>,
  statuses: Partial<Record<string, 'ok' | 'missing' | 'unchecked'>> = {},
): MapReader {
  const status = (name: string) => statuses[name] ?? 'ok';
  return {
    has: (name) => status(name) === 'ok',
    missing: (name) => status(name) === 'missing',
    number: (name) => values[name] ?? null,
  };
}

describe('mapModel', () => {
  const full = {
    [M.latitude]: 47.449,
    [M.longitude]: -122.309,
    [M.elevation]: 132,
    [M.trueHeading]: 180,
    [M.trueTrack]: 181,
    [D.groundSpeed]: 140,
    [D.groundTrack]: 165,
  };

  it('is ready with every value', () => {
    expect(mapModel(reader(full))).toEqual({
      status: 'ready',
      position: { lat: 47.449, lon: -122.309 },
      elevationM: 132,
      trueHeading: 180,
      trueTrack: 181,
      groundSpeedKt: 140,
      magneticTrack: 165,
    });
  });

  it('is unavailable only when latitude or longitude is definitively missing', () => {
    expect(mapModel(reader(full, { [M.longitude]: 'missing' })).status).toBe('unavailable');
    expect(mapModel(reader(full, { [M.latitude]: 'unchecked' })).status).toBe('unchecked');
  });

  it('waits for a position that has not arrived or is off the planet', () => {
    const noLat = Object.fromEntries(Object.entries(full).filter(([name]) => name !== M.latitude));
    expect(mapModel(reader(noLat)).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.latitude]: 91 })).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.longitude]: -180.5 })).status).toBe('waiting');
    expect(mapModel(reader({ ...full, [M.latitude]: 0, [M.longitude]: 0 })).status).toBe('ready');
  });

  it('drops an optional value that is missing or unchecked', () => {
    const model = mapModel(reader(full, { [M.trueTrack]: 'missing', [M.elevation]: 'unchecked' }));
    expect(model.trueTrack).toBeNull();
    expect(model.elevationM).toBeNull();
    expect(model.trueHeading).toBe(180);
  });
});

describe('messages', () => {
  it('names the aircraft', () => {
    expect(mapUnavailable('Cessna 172')).toBe(
      "The moving map isn't available on the Cessna 172: X-Plane doesn't report its position.",
    );
    expect(mapUnavailable(null)).toBe(
      "The moving map isn't available on this aircraft: X-Plane doesn't report its position.",
    );
    expect(MAP_CREDIT).toBe('Outlines: Natural Earth. Runways: OurAirports. Not for navigation.');
  });
});
