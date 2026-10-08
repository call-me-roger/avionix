import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { MAP_DATAREFS as M } from '@/domain/map/catalogue';

import { mapSnapshot, svgText, symbolX, transformOf, mapTree as tree } from '../helpers/map';

const HIDDEN = { includeHiddenElements: true };
/** The map's own words are drawn as SVG text, read back through `svgText`. */
const DRAWN_TEXT = [
  'map-ring-outer-label',
  'map-ring-inner-label',
  'map-airport',
  'map-ownship-stale',
];

/** On screen, as a native text or drawn into the map. */
const has = (text: string) =>
  screen.queryAllByText(text, HIDDEN).length > 0 ||
  DRAWN_TEXT.some((id) =>
    screen.queryAllByTestId(id, HIDDEN).some((node) => svgText(node) === text),
  );

const rotationOf = (testID: string) => transformOf(screen.getByTestId(testID, HIDDEN));

/** The aircraft polygon's fill as the native view gets it: null when drawn hollow. */
const symbolFill = (): unknown => {
  const shape = screen.getByTestId('map-ownship', HIDDEN).children[0];
  return typeof shape === 'object' ? shape.props.fill : undefined;
};

describe('Map panel', () => {
  it('draws the symbol at the centre, turned to the true track, in north-up', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByTestId('map-ownship', HIDDEN)).toBeTruthy();
    expect(rotationOf('map-ownship')).toContain('rotate(90)');
    expect(symbolFill()).not.toBeNull();
    const ring = screen.getByTestId('map-ring-outer', HIDDEN);
    expect(symbolX(rotationOf('map-ownship'))).toBeCloseTo(Number(ring.props.cx), 3);
    expect(has('10 nm')).toBe(true);
    expect(has('5 nm')).toBe(true);
    expect(screen.queryByTestId('map-north-arrow', HIDDEN)).toBeNull();
  });

  it('points along the heading when standing still', async () => {
    await render(tree(mapSnapshot({ values: { [D.groundSpeed]: 0 } })));
    expect(rotationOf('map-ownship')).toContain('rotate(85)');
  });

  it('draws a circle and says so when neither track nor heading exists', async () => {
    await render(
      tree(mapSnapshot({ bindings: { [M.trueTrack]: 'missing', [M.trueHeading]: 'missing' } })),
    );
    expect(screen.getByTestId('map-ownship-circle', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Track not available.')).toBeTruthy();
  });

  it('draws a circle without the sentence while track and heading are only pending', async () => {
    await render(tree(mapSnapshot({ absent: [M.trueTrack, M.trueHeading] })));
    expect(screen.getByTestId('map-ownship-circle', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('Track not available.')).toBeNull();
  });

  it('speaks the true heading when standing still', async () => {
    await render(tree(mapSnapshot({ values: { [D.groundSpeed]: 0 } })));
    expect(
      screen.getByLabelText(
        'Map, north up, 10 nautical mile range, position N 47 26.94, W 122 18.56, true heading 085',
      ),
    ).toBeTruthy();
  });

  it('shows the readout as the strip formats it', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByLabelText('Position: N47°26.94′ W122°18.56′')).toBeTruthy();
    expect(screen.getByLabelText('GPS alt: 433 ft')).toBeTruthy();
    expect(screen.getByLabelText('Ground speed: 140 kt')).toBeTruthy();
    expect(screen.getByLabelText('Track (magnetic): 075°')).toBeTruthy();
  });

  it('labels the rings in kilometres when the pilot uses km', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      'avionix.units',
      JSON.stringify({ fuel: 'kg', temperature: 'C', distance: 'km', pressure: 'hPa' }),
    );
    await render(tree(mapSnapshot(), { storage }));
    await waitFor(() => expect(has('10 km')).toBe(true));
  });

  it('keeps the last position hollow and tagged when not live', async () => {
    await render(tree(mapSnapshot({ stale: true })));
    expect(screen.getByTestId('map-ownship-stale', HIDDEN)).toBeTruthy();
    expect(has('LAST KNOWN')).toBe(true);
    expect(symbolFill()).toBeNull();
    expect(screen.getByTestId('panel-notice')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Map, north up, 10 nautical mile range, position N 47 26.94, W 122 18.56, true track 090, last known position',
      ),
    ).toBeTruthy();
  });

  it('says nothing while the map has no room yet', async () => {
    await render(tree(mapSnapshot()));
    await fireEvent(screen.getByTestId('map-area'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } },
    });
    expect(screen.queryByTestId('map-canvas', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('map-message')).toBeNull();
    expect(screen.queryByText('Waiting for position.')).toBeNull();
  });

  it('waits without a symbol while the position has not arrived', async () => {
    await render(tree(mapSnapshot({ absent: [M.latitude] })));
    expect(screen.queryByTestId('map-ownship', HIDDEN)).toBeNull();
    expect(screen.getByText('Waiting for position.')).toBeTruthy();
  });

  it('draws nothing and says nothing while the names are unchecked', async () => {
    await render(tree(mapSnapshot({ bindings: { [M.latitude]: 'unchecked' } })));
    expect(screen.queryByTestId('map-canvas', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('map-message')).toBeNull();
  });

  it('is one sentence when the aircraft has no position', async () => {
    await render(tree(mapSnapshot({ bindings: { [M.latitude]: 'missing' } })));
    expect(
      screen.getByText(
        "The moving map isn't available on the Cessna 172: X-Plane doesn't report its position.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('map-canvas', HIDDEN)).toBeNull();
  });

  it('shows no symbol with no flight loaded', async () => {
    await render(tree(mapSnapshot({ noFlight: true })));
    expect(screen.queryByTestId('map-ownship', HIDDEN)).toBeNull();
  });

  it('draws the runways around Seattle–Tacoma and their identifier', async () => {
    await render(tree(mapSnapshot()));
    expect(has('KSEA')).toBe(true);
    expect(screen.getAllByTestId('map-runway', HIDDEN).length).toBeGreaterThanOrEqual(3);
  });

  it('describes the map in one sentence and credits its sources', async () => {
    await render(tree(mapSnapshot()));
    expect(
      screen.getByLabelText(
        'Map, north up, 10 nautical mile range, position N 47 26.94, W 122 18.56, true track 090',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Outlines: Natural Earth. Runways: OurAirports. Not for navigation.'),
    ).toBeTruthy();
  });
});

describe('Map panel paths (spec §4.3)', () => {
  const landPath = () => String(screen.getByTestId('map-land', HIDDEN).props.d);
  const runwayCount = () => screen.getAllByTestId('map-runway', HIDDEN).length;
  const layerMatrix = () => JSON.stringify(screen.getByTestId('map-layers', HIDDEN).props.matrix);
  const outerLabel = () => svgText(screen.getByTestId('map-ring-outer-label', HIDDEN));

  it('moves only the group transform on a tick within a quarter of the range', async () => {
    const storage = createMemorySettingsStorage();
    const { rerender } = await render(tree(mapSnapshot(), { storage }));
    const before = { land: landPath(), runways: runwayCount(), matrix: layerMatrix() };
    expect(before.land.length).toBeGreaterThan(0);
    // One minute of latitude north: 1 nm, under the 2.5 nm a 10 nm range re-anchors at.
    await rerender(tree(mapSnapshot({ values: { [M.latitude]: 47.449 + 1 / 60 } }), { storage }));
    expect(landPath()).toBe(before.land);
    expect(runwayCount()).toBe(before.runways);
    expect(layerMatrix()).not.toBe(before.matrix);
  });

  it('rebuilds the paths when the range changes', async () => {
    const memory = createMemorySettingsStorage();
    await memory.setItem('avionix.map', JSON.stringify({ orientation: 'north', range: 80 }));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The remembered range arrives only once released, so the same map changes range in place.
    const storage: SettingsStorage = {
      getItem: async (key) => {
        if (key === 'avionix.map') {
          await gate;
        }
        return memory.getItem(key);
      },
      setItem: (key, value) => memory.setItem(key, value),
    };
    await render(tree(mapSnapshot(), { storage }));
    expect(outerLabel()).toBe('10 nm');
    const before = { land: landPath(), runways: runwayCount() };
    await act(async () => {
      release();
    });
    await waitFor(() => expect(outerLabel()).toBe('80 nm'));
    expect(landPath()).not.toBe(before.land);
    expect(runwayCount()).not.toBe(before.runways);
  });
});
