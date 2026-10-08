import {
  groupTransform,
  mapView,
  needsReanchor,
  screenDeltaToPlane,
  toScreen,
} from '@/domain/map/view';

describe('mapView', () => {
  it('centres north-up and fits the ring to the shorter half', () => {
    const view = mapView({
      width: 400,
      height: 600,
      orientation: 'north',
      rangeNm: 10,
      direction: 90,
    })!;
    expect(view).toMatchObject({ anchorX: 200, anchorY: 300, rotation: 0, trackUp: false });
    expect(view.ringRadiusPx).toBeCloseTo(180);
    expect(view.pxPerNm).toBeCloseTo(18);
    expect(view.visibleRadiusNm).toBeCloseTo(Math.hypot(200, 300) / 18);
  });

  it('puts the symbol at 70% in track-up and turns the map', () => {
    const view = mapView({
      width: 400,
      height: 600,
      orientation: 'track',
      rangeNm: 10,
      direction: 90,
    })!;
    expect(view).toMatchObject({ anchorX: 200, anchorY: 420, rotation: -90, trackUp: true });
    expect(view.ringRadiusPx).toBeCloseTo(180);
  });

  it('falls back to north-up when there is no direction', () => {
    const view = mapView({
      width: 400,
      height: 600,
      orientation: 'track',
      rangeNm: 10,
      direction: null,
    })!;
    expect(view).toMatchObject({ anchorY: 300, rotation: 0, trackUp: false });
  });

  it('is null for a map with no size yet', () => {
    expect(
      mapView({ width: 0, height: 600, orientation: 'north', rangeNm: 10, direction: 0 }),
    ).toBeNull();
    expect(
      mapView({ width: 400, height: 0, orientation: 'north', rangeNm: 10, direction: 0 }),
    ).toBeNull();
  });
});

describe('screen transforms', () => {
  const view = mapView({
    width: 400,
    height: 600,
    orientation: 'track',
    rangeNm: 10,
    direction: 90,
  })!;

  it('rotates a point east of the symbol to straight ahead in track-up east', () => {
    const p = toScreen(view, { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(420 - 180);
  });

  it('inverts a drag', () => {
    const plane = screenDeltaToPlane(view, 0, -180);
    expect(plane.x).toBeCloseTo(10);
    expect(plane.y).toBeCloseTo(0);
  });

  it('writes one SVG transform', () => {
    expect(groupTransform(view, { x: 1, y: 2 })).toBe(
      'translate(200 420) rotate(-90) scale(18) translate(-1 -2)',
    );
  });
});

describe('needsReanchor', () => {
  const sea = { lat: 47.449, lon: -122.309 };
  it('moves the anchor past a quarter of the range', () => {
    expect(needsReanchor(null, sea, 10)).toBe(true);
    expect(needsReanchor(sea, { lat: 47.48, lon: -122.309 }, 10)).toBe(false);
    expect(needsReanchor(sea, { lat: 47.5, lon: -122.309 }, 10)).toBe(true);
  });
});
