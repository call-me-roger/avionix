import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  MAP_STORAGE_KEY,
  loadMapPreference,
  saveMapPreference,
} from '@/features/panels/map/map-preference';

describe('map preference', () => {
  it('defaults to north-up and 10', async () => {
    await expect(loadMapPreference(createMemorySettingsStorage())).resolves.toEqual({
      orientation: 'north',
      range: 10,
    });
  });

  it('round-trips', async () => {
    const storage = createMemorySettingsStorage();
    await saveMapPreference(storage, { orientation: 'track', range: 40 });
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'track', range: 40 });
  });

  it('falls back field by field on a bad value', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify({ orientation: 'track', range: 7 }));
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'track', range: 10 });
    await storage.setItem(MAP_STORAGE_KEY, '{not json');
    await expect(loadMapPreference(storage)).resolves.toEqual({ orientation: 'north', range: 10 });
  });
});
