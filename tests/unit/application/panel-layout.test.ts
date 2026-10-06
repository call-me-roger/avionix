import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  RETIRED_PANEL_IDS,
  SETUP_ROUTE,
  canHidePanel,
  loadPanelLayout,
  normaliseLayout,
  resolveRoute,
  savePanelLayout,
  setPanelHidden,
  setStripShown,
  visiblePanelIds,
} from '@/application/panel-layout';
import { createMemorySettingsStorage } from '@/application/settings-store';

const KNOWN = ['flight-data', 'heading'];
// Autopilot stands in for 'heading' here: this release's known ids, where 'heading' has been
// retired and replaced.
const KNOWN_WITH_AUTOPILOT = ['flight-data', 'autopilot'];

describe('panel layout rules', () => {
  it('opens on Setup the first time, where the pilot connects', () => {
    expect(DEFAULT_PANEL_LAYOUT).toEqual({ hidden: [], last: SETUP_ROUTE, strip: true });
  });

  it('drops ids this release does not know, and duplicates', () => {
    expect(
      normaliseLayout({ hidden: ['gone', 'heading', 'heading'], last: 'gone', strip: true }, KNOWN),
    ).toEqual({ hidden: ['heading'], last: SETUP_ROUTE, strip: true });
  });

  it('never leaves every panel hidden', () => {
    expect(
      normaliseLayout({ hidden: ['flight-data', 'heading'], last: 'setup', strip: true }, KNOWN),
    ).toEqual({
      hidden: [],
      last: SETUP_ROUTE,
      strip: true,
    });
  });

  it('moves a pilot who last used the retired Heading panel to Autopilot', () => {
    expect(
      normaliseLayout({ hidden: [], last: 'heading', strip: true }, KNOWN_WITH_AUTOPILOT).last,
    ).toBe('autopilot');
  });

  it('drops a hidden Heading panel instead of hiding Autopilot', () => {
    expect(
      normaliseLayout({ hidden: ['heading'], last: 'setup', strip: true }, KNOWN_WITH_AUTOPILOT)
        .hidden,
    ).toEqual([]);
  });

  it('lists visible panels in registry order', () => {
    expect(
      visiblePanelIds({ hidden: ['flight-data'], last: SETUP_ROUTE, strip: true }, KNOWN),
    ).toEqual(['heading']);
  });

  it('restores Setup or an available panel, else falls back', () => {
    expect(resolveRoute(SETUP_ROUTE, KNOWN)).toBe(SETUP_ROUTE);
    expect(resolveRoute('heading', KNOWN)).toBe('heading');
    expect(resolveRoute('heading', ['flight-data'])).toBe('flight-data');
    expect(resolveRoute('heading', [])).toBe(SETUP_ROUTE);
  });

  it('hides and shows a panel, but never the last visible one', () => {
    const shown = { hidden: [], last: SETUP_ROUTE, strip: true };
    const oneHidden = setPanelHidden(shown, KNOWN, 'heading', true);
    expect(oneHidden.hidden).toEqual(['heading']);
    expect(canHidePanel(oneHidden, KNOWN, 'flight-data')).toBe(false);
    expect(setPanelHidden(oneHidden, KNOWN, 'flight-data', true)).toBe(oneHidden);
    expect(setPanelHidden(oneHidden, KNOWN, 'heading', false).hidden).toEqual([]);
    expect(setPanelHidden(shown, KNOWN, 'unknown', true)).toBe(shown);
  });
});

describe('panel layout persistence', () => {
  it('round-trips under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await savePanelLayout(storage, { hidden: ['heading'], last: 'flight-data', strip: true });
    expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
      hidden: ['heading'],
      last: 'flight-data',
      strip: true,
    });
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: ['heading'],
      last: 'flight-data',
      strip: true,
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

describe('the strip setting and retired ids', () => {
  it('shows the strip by default, including for a layout saved before the setting existed', async () => {
    expect(DEFAULT_PANEL_LAYOUT.strip).toBe(true);
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: [], last: 'heading' }),
    );
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: [],
      last: 'heading',
      strip: true,
    });
  });

  it('reopens a pilot who last had Basic data on Flight data', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['basic-data'], last: 'basic-data' }),
    );
    // `last` is migrated to its successor, but a retired id in `hidden` is simply dropped (like
    // any other unknown id) rather than carried over as its successor, so Flight data is not
    // hidden by a stored `basic-data` and appears by default (controller ruling, final-fixes #7).
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: [],
      last: 'flight-data',
      strip: true,
    });
    expect(RETIRED_PANEL_IDS).toEqual({ 'basic-data': 'flight-data', heading: 'autopilot' });
  });

  it('keeps a retired id as-is while it is still registered as a known panel', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: [], last: 'basic-data' }),
    );
    await expect(loadPanelLayout(storage, ['basic-data', 'heading'])).resolves.toEqual({
      hidden: [],
      last: 'basic-data',
      strip: true,
    });
  });

  it('round-trips the strip setting', async () => {
    const storage = createMemorySettingsStorage();
    await savePanelLayout(storage, { hidden: [], last: 'heading', strip: false });
    await expect(loadPanelLayout(storage, KNOWN)).resolves.toEqual({
      hidden: [],
      last: 'heading',
      strip: false,
    });
  });

  it('turns the strip on and off, returning the same layout when nothing changes', () => {
    const layout = { hidden: [], last: SETUP_ROUTE, strip: true };
    expect(setStripShown(layout, true)).toBe(layout);
    expect(setStripShown(layout, false)).toEqual({ ...layout, strip: false });
  });
});
