import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  SETUP_ROUTE,
  canHidePanel,
  loadPanelLayout,
  normaliseLayout,
  resolveRoute,
  savePanelLayout,
  setPanelHidden,
  visiblePanelIds,
} from '@/application/panel-layout';
import { createMemorySettingsStorage } from '@/application/settings-store';

const KNOWN = ['basic-data', 'heading'];

describe('panel layout rules', () => {
  it('opens on Setup the first time, where the pilot connects', () => {
    expect(DEFAULT_PANEL_LAYOUT).toEqual({ hidden: [], last: SETUP_ROUTE });
  });

  it('drops ids this release does not know, and duplicates', () => {
    expect(
      normaliseLayout({ hidden: ['gone', 'heading', 'heading'], last: 'gone' }, KNOWN),
    ).toEqual({ hidden: ['heading'], last: SETUP_ROUTE });
  });

  it('never leaves every panel hidden', () => {
    expect(normaliseLayout({ hidden: ['basic-data', 'heading'], last: 'setup' }, KNOWN)).toEqual({
      hidden: [],
      last: SETUP_ROUTE,
    });
  });

  it('lists visible panels in registry order', () => {
    expect(visiblePanelIds({ hidden: ['basic-data'], last: SETUP_ROUTE }, KNOWN)).toEqual([
      'heading',
    ]);
  });

  it('restores Setup or an available panel, else falls back', () => {
    expect(resolveRoute(SETUP_ROUTE, KNOWN)).toBe(SETUP_ROUTE);
    expect(resolveRoute('heading', KNOWN)).toBe('heading');
    expect(resolveRoute('heading', ['basic-data'])).toBe('basic-data');
    expect(resolveRoute('heading', [])).toBe(SETUP_ROUTE);
  });

  it('hides and shows a panel, but never the last visible one', () => {
    const shown = { hidden: [], last: SETUP_ROUTE };
    const oneHidden = setPanelHidden(shown, KNOWN, 'heading', true);
    expect(oneHidden.hidden).toEqual(['heading']);
    expect(canHidePanel(oneHidden, KNOWN, 'basic-data')).toBe(false);
    expect(setPanelHidden(oneHidden, KNOWN, 'basic-data', true)).toBe(oneHidden);
    expect(setPanelHidden(oneHidden, KNOWN, 'heading', false).hidden).toEqual([]);
    expect(setPanelHidden(shown, KNOWN, 'unknown', true)).toBe(shown);
  });
});

describe('panel layout persistence', () => {
  it('round-trips under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await savePanelLayout(storage, { hidden: ['heading'], last: 'basic-data' });
    expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
      hidden: ['heading'],
      last: 'basic-data',
    });
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: ['heading'],
      last: 'basic-data',
    });
  });

  it.each([
    ['nothing stored', null],
    ['corrupt JSON', '{not json'],
    ['a wrong shape', JSON.stringify({ hidden: 'heading' })],
  ])('falls back to the default for %s', async (_label, raw) => {
    const storage = createMemorySettingsStorage();
    if (raw !== null) {
      await storage.setItem(PANEL_LAYOUT_STORAGE_KEY, raw);
    }
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('normalises what it loads, so a retired panel cannot become the route', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['retired'], last: 'retired' }),
    );
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it('swallows storage failures on read and write', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadPanelLayout(broken, KNOWN)).resolves.toEqual(DEFAULT_PANEL_LAYOUT);
    await expect(savePanelLayout(broken, DEFAULT_PANEL_LAYOUT)).resolves.toBeUndefined();
  });
});
