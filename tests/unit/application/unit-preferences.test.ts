import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  UNITS_STORAGE_KEY,
  loadUnitPreferences,
  saveUnitPreferences,
} from '@/application/unit-preferences';
import { DEFAULT_UNITS } from '@/domain/units/units';

describe('unit preferences', () => {
  it('defaults when nothing is stored', async () => {
    await expect(loadUnitPreferences(createMemorySettingsStorage())).resolves.toEqual(
      DEFAULT_UNITS,
    );
  });

  it('round-trips under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await saveUnitPreferences(storage, { fuel: 'lb', temperature: 'F', distance: 'km' });
    expect(JSON.parse((await storage.getItem(UNITS_STORAGE_KEY)) ?? 'null')).toEqual({
      fuel: 'lb',
      temperature: 'F',
      distance: 'km',
    });
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      fuel: 'lb',
      temperature: 'F',
      distance: 'km',
    });
  });

  it('falls back one field at a time, keeping the valid ones', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify({ fuel: 'lb', temperature: 'kelvin' }));
    await expect(loadUnitPreferences(storage)).resolves.toEqual({
      fuel: 'lb',
      temperature: 'C',
      distance: 'nm',
    });
  });

  it.each([
    ['corrupt JSON', '{nope'],
    ['a wrong shape', JSON.stringify(['lb'])],
  ])('defaults for %s', async (_label, raw) => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(UNITS_STORAGE_KEY, raw);
    await expect(loadUnitPreferences(storage)).resolves.toEqual(DEFAULT_UNITS);
  });

  it('swallows storage failures', async () => {
    const broken = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadUnitPreferences(broken)).resolves.toEqual(DEFAULT_UNITS);
    await expect(saveUnitPreferences(broken, DEFAULT_UNITS)).resolves.toBeUndefined();
  });
});
