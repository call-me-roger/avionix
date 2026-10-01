import {
  INSTRUMENTS_STORAGE_KEY,
  loadInstrumentPreferences,
  saveInstrumentPreferences,
} from '@/application/instrument-preferences';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { DEFAULT_PRESENTATION_PREFERENCES } from '@/domain/instruments/presentation';

describe('instrument preferences', () => {
  it('defaults when nothing is stored', async () => {
    await expect(loadInstrumentPreferences(createMemorySettingsStorage())).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
  });

  it('round-trips', async () => {
    const storage = createMemorySettingsStorage();
    const prefs = { last: 'sixPack' as const, byAircraft: { C172: 'sixPack' as const } };
    await saveInstrumentPreferences(storage, prefs);
    expect(await storage.getItem(INSTRUMENTS_STORAGE_KEY)).toBe(JSON.stringify(prefs));
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual(prefs);
  });

  it('defaults on corrupt JSON', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(INSTRUMENTS_STORAGE_KEY, '{not json');
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
  });

  it('keeps every good field and every good aircraft', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      INSTRUMENTS_STORAGE_KEY,
      JSON.stringify({ last: 'hud', byAircraft: { C172: 'sixPack', B738: 'hud', A320: 3 } }),
    );
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual({
      last: 'pfd',
      byAircraft: { C172: 'sixPack' },
    });
  });

  it('drops a byAircraft that is not an object', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      INSTRUMENTS_STORAGE_KEY,
      JSON.stringify({ last: 'sixPack', byAircraft: ['C172'] }),
    );
    await expect(loadInstrumentPreferences(storage)).resolves.toEqual({
      last: 'sixPack',
      byAircraft: {},
    });
  });

  it('never throws when storage fails', async () => {
    const failing = {
      getItem: jest.fn(async () => {
        throw new Error('disk');
      }),
      setItem: jest.fn(async () => {
        throw new Error('disk');
      }),
    };
    await expect(loadInstrumentPreferences(failing)).resolves.toEqual(
      DEFAULT_PRESENTATION_PREFERENCES,
    );
    await expect(
      saveInstrumentPreferences(failing, DEFAULT_PRESENTATION_PREFERENCES),
    ).resolves.toBeUndefined();
  });
});
