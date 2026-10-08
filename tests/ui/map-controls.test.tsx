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
  transformOf as matrixTransform,
} from '../helpers/map';

const HIDDEN = { includeHiddenElements: true };
/** The symbol's `translate(x y) rotate(a)`, read back from the matrix the svg mock receives. */
const transformOf = (testID: string) => matrixTransform(screen.getByTestId(testID, HIDDEN));
/** On screen as a native text (the stepper) or drawn as the outer ring's label. */
const has = (text: string) =>
  screen.queryAllByText(text, HIDDEN).length > 0 ||
  screen.queryAllByTestId('map-ring-outer-label', HIDDEN).some((node) => svgText(node) === text);

async function drag(dx: number) {
  const touch = screen.getByTestId('map-touch');
  await fireEvent(touch, 'responderGrant', { nativeEvent: { pageX: 100, pageY: 100 } });
  await fireEvent(touch, 'responderMove', { nativeEvent: { pageX: 100 + dx, pageY: 100 } });
  await fireEvent(touch, 'responderRelease', { nativeEvent: { pageX: 100 + dx, pageY: 100 } });
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
    await drag(60);
    await fireEvent.press(screen.getByTestId('map-range-up'));
    expect(screen.getByRole('button', { name: 'Centre' })).toBeTruthy();
    expect(has('20 nm')).toBe(true);
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

  it('stacks the controls above the map in a tall frame', async () => {
    await render(mapTree(mapSnapshot()));
    await layout(360, 640);
    expect(direction()).toBe('column');
    expect(screen.queryByTestId('map-side-column')).toBeNull();
    expect(screen.getByTestId('map-range-up')).toBeTruthy();
    expect(screen.getByTestId('map-credit')).toBeTruthy();
  });
});
