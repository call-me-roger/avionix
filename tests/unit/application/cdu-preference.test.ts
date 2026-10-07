import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  CDU_STORAGE_KEY,
  loadCduPreference,
  saveCduPreference,
} from '@/features/panels/cdu/cdu-preference';

describe('CDU preference', () => {
  it('defaults to CDU 1 when nothing is stored', async () => {
    await expect(loadCduPreference(createMemorySettingsStorage())).resolves.toBe(1);
  });

  it('saves and loads CDU 2', async () => {
    const storage = createMemorySettingsStorage();
    await saveCduPreference(storage, 2);
    expect(await storage.getItem(CDU_STORAGE_KEY)).toBe(JSON.stringify({ unit: 2 }));
    await expect(loadCduPreference(storage)).resolves.toBe(2);
  });

  it('loads CDU 1 from malformed JSON', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(CDU_STORAGE_KEY, '{not json');
    await expect(loadCduPreference(storage)).resolves.toBe(1);
  });

  it('loads CDU 1 from a unit that does not exist', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(CDU_STORAGE_KEY, JSON.stringify({ unit: 3 }));
    await expect(loadCduPreference(storage)).resolves.toBe(1);
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
    await expect(loadCduPreference(failing)).resolves.toBe(1);
    await expect(saveCduPreference(failing, 2)).resolves.toBeUndefined();
  });
});
