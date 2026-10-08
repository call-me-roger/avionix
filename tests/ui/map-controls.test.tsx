import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { MAP_STORAGE_KEY } from '@/features/panels/map/map-preference';

import {
  MAP_NOW as NOW,
  mapSnapshot,
  mapTree,
  svgText,
  symbolX,
  symbolY,
  transformOf as matrixTransform,
} from '../helpers/map';

const HIDDEN = { includeHiddenElements: true };
/** The symbol's `translate(x y) rotate(a)`, read back from the matrix the svg mock receives. */
const transformOf = (testID: string) => matrixTransform(screen.getByTestId(testID, HIDDEN));
/** On screen as a native text (the stepper) or drawn as the outer ring's label. */
const has = (text: string) =>
  screen.queryAllByText(text, HIDDEN).length > 0 ||
  screen.queryAllByTestId('map-ring-outer-label', HIDDEN).some((node) => svgText(node) === text);

async function drag(dx: number, dy = 0) {
  const touch = screen.getByTestId('map-touch');
  const end = { pageX: 100 + dx, pageY: 100 + dy };
  await fireEvent(touch, 'responderGrant', { nativeEvent: { pageX: 100, pageY: 100 } });
  await fireEvent(touch, 'responderMove', { nativeEvent: end });
  await fireEvent(touch, 'responderRelease', { nativeEvent: end });
}

describe('map controls', () => {
  it('switches to track-up: the map turns, the symbol stands upright, the north arrow shows', async () => {
    const storage = createMemorySettingsStorage();
    await render(mapTree(mapSnapshot(), { storage }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Track up' }));
    expect(transformOf('map-ownship')).toContain('rotate(0)');
    expect(screen.getByTestId('map-north-arrow', HIDDEN)).toBeTruthy();
    expect(JSON.parse((await storage.getItem(MAP_STORAGE_KEY))!)).toEqual({
      orientation: 'track',
      range: 10,
    });
  });

  it('steps the range and stops at the ends', async () => {
    const storage = createMemorySettingsStorage();
    await render(mapTree(mapSnapshot(), { storage }));
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(has('20 nm')).toBe(true);
    expect(svgText(screen.getByTestId('map-ring-outer-label', HIDDEN))).toBe('20 nm');
    for (let i = 0; i < 6; i += 1) {
      await fireEvent.press(screen.getByTestId('map-range-down'));
    }
    expect(has('2 nm')).toBe(true);
    expect(screen.getByTestId('map-range-down').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(JSON.parse((await storage.getItem(MAP_STORAGE_KEY))!)).toEqual({
      orientation: 'north',
      range: 2,
    });
  });

  it('names the range steppers in whole words', async () => {
    await render(mapTree(mapSnapshot()));
    expect(screen.getByRole('button', { name: 'Zoom in, range 10 nautical miles' })).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Zoom out, range 10 nautical miles' }),
    );
    expect(screen.getByRole('button', { name: 'Zoom out, range 20 nautical miles' })).toBeTruthy();
  });

  it('names the range steppers in kilometres when the pilot uses km', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      'avionix.units',
      JSON.stringify({ fuel: 'kg', temperature: 'C', distance: 'km', pressure: 'hPa' }),
    );
    await render(mapTree(mapSnapshot(), { storage }));
    expect(
      await screen.findByRole('button', { name: 'Zoom in, range 10 kilometres' }),
    ).toBeTruthy();
  });

  it('restores the remembered settings', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify({ orientation: 'track', range: 40 }));
    await render(mapTree(mapSnapshot(), { storage }));
    expect((await screen.findAllByText('40 nm', HIDDEN)).length).toBeGreaterThan(0);
    expect(screen.getByRole('radio', { name: 'Track up' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it('pans with a drag, offers Centre, and centres again on Centre', async () => {
    await render(mapTree(mapSnapshot()));
    const before = symbolX(transformOf('map-ownship'));
    await drag(60);
    // The map follows the finger, so the symbol moves 60 px right with it (north-up).
    expect(symbolX(transformOf('map-ownship'))).toBeCloseTo(before + 60, 3);
    await fireEvent.press(screen.getByRole('button', { name: 'Centre' }));
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
    expect(symbolX(transformOf('map-ownship'))).toBeCloseTo(before, 3);
  });

  it('pans under the finger in track-up too, whatever way the map is turned', async () => {
    await render(mapTree(mapSnapshot()));
    await fireEvent.press(screen.getByRole('radio', { name: 'Track up' }));
    // Track 090: the map is turned a quarter turn, so a plane offset would show up rotated.
    expect(screen.getByTestId('map-north-arrow', HIDDEN)).toBeTruthy();
    const before = transformOf('map-ownship');
    await drag(40, -30);
    const after = transformOf('map-ownship');
    expect(symbolX(after)).toBeCloseTo(symbolX(before) + 40, 3);
    expect(symbolY(after)).toBeCloseTo(symbolY(before) - 30, 3);
    expect(after).toContain('rotate(0)');
  });

  it('hides a same-size Centre slot until the map is panned, so the row never grows', async () => {
    await render(mapTree(mapSnapshot()));
    const slot = () => screen.getByTestId('map-centre-slot', HIDDEN);
    expect(StyleSheet.flatten(slot().props.style).opacity).toBe(0);
    expect(slot().props.accessibilityElementsHidden).toBe(true);
    expect(slot().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(slot().props.pointerEvents).toBe('none');
    expect(within(slot()).getByText('Centre', HIDDEN)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
    expect(screen.queryByTestId('map-centre')).toBeNull();
    await drag(60);
    expect(StyleSheet.flatten(slot().props.style)?.opacity ?? 1).toBe(1);
    expect(slot().props.accessibilityElementsHidden).toBe(false);
    expect(within(slot()).getByRole('button', { name: 'Centre' })).toBeTruthy();
  });

  it('ignores a tap that does not move', async () => {
    await render(mapTree(mapSnapshot()));
    await drag(2);
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
  });

  it('centres again by itself 30 s after the last touch', async () => {
    const storage = createMemorySettingsStorage();
    const { rerender } = await render(mapTree(mapSnapshot(), { storage, now: NOW }));
    await drag(60);
    await rerender(mapTree(mapSnapshot(), { storage, now: NOW + 29_000 }));
    expect(screen.getByRole('button', { name: 'Centre' })).toBeTruthy();
    await rerender(mapTree(mapSnapshot(), { storage, now: NOW + 30_000 }));
    expect(screen.queryByRole('button', { name: 'Centre' })).toBeNull();
  });

  it('keeps the panned centre when the range changes', async () => {
    await render(mapTree(mapSnapshot()));
    // Unpanned, the symbol sits where the map's centre is drawn.
    const anchorX = symbolX(transformOf('map-ownship'));
    await drag(60);
    const offset = symbolX(transformOf('map-ownship')) - anchorX;
    expect(offset).toBeCloseTo(60, 3);
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(screen.getByRole('button', { name: 'Centre' })).toBeTruthy();
    expect(has('20 nm')).toBe(true);
    // The same geographic centre at twice the range: the symbol sits half as far from it.
    expect(symbolX(transformOf('map-ownship')) - anchorX).toBeCloseTo(offset / 2, 3);
  });

  it('keeps every control usable when the link is not live', async () => {
    await render(mapTree(mapSnapshot({ stale: true })));
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(has('20 nm')).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Track up' }));
    expect(screen.getByTestId('map-north-arrow', HIDDEN)).toBeTruthy();
  });
});

describe('map layout', () => {
  const layout = async (width: number, height: number) =>
    fireEvent(screen.getByTestId('map-layout'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
  const direction = () =>
    StyleSheet.flatten(screen.getByTestId('map-layout').props.style).flexDirection;

  it('puts the map and a side column side by side in a wide frame', async () => {
    await render(mapTree(mapSnapshot()));
    await layout(800, 360);
    expect(direction()).toBe('row');
    const side = screen.getByTestId('map-side-column');
    expect(within(side).getByTestId('map-range-up')).toBeTruthy();
    expect(within(side).getByTestId('map-credit')).toBeTruthy();
    expect(within(side).queryByTestId('map-touch')).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('map-area').props.style).flex).toBe(1);
  });

  it('uses the side column in a 900×500 frame', async () => {
    await render(mapTree(mapSnapshot()));
    await layout(900, 500);
    expect(direction()).toBe('row');
    expect(screen.getByTestId('map-side-column')).toBeTruthy();
  });

  it('stacks a wide frame that would leave the map under 240 dp beside the column', async () => {
    await render(mapTree(mapSnapshot()));
    await layout(500, 480);
    expect(direction()).toBe('column');
    expect(screen.queryByTestId('map-side-column')).toBeNull();
  });

  it('stacks the controls above the map in a tall frame', async () => {
    await render(mapTree(mapSnapshot()));
    await layout(360, 640);
    expect(direction()).toBe('column');
    expect(screen.queryByTestId('map-side-column')).toBeNull();
    expect(screen.getByTestId('map-range-up')).toBeTruthy();
    expect(screen.getByTestId('map-credit')).toBeTruthy();
  });
});
