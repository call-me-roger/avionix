import { render, screen, waitFor } from '@testing-library/react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
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

describe('Map panel', () => {
  it('draws the symbol at the centre, turned to the true track, in north-up', async () => {
    await render(tree(mapSnapshot()));
    expect(screen.getByTestId('map-ownship', HIDDEN)).toBeTruthy();
    expect(rotationOf('map-ownship')).toContain('rotate(90)');
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
    expect(screen.getByTestId('panel-notice')).toBeTruthy();
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
        'Map, north up, 10 nautical mile range, position N 47 26.94, W 122 18.56, track 090',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Outlines: Natural Earth. Runways: OurAirports. Not for navigation.'),
    ).toBeTruthy();
  });
});
