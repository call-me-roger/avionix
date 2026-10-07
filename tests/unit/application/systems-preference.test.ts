import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  SYSTEMS_STORAGE_KEY,
  loadSystemsPage,
  saveSystemsPage,
} from '@/features/panels/systems/systems-preference';

describe('Systems preference', () => {
  it('defaults to FLIGHT when nothing is stored', async () => {
    await expect(loadSystemsPage(createMemorySettingsStorage())).resolves.toBe('flight');
  });

  it('saves and loads LIGHTS', async () => {
    const storage = createMemorySettingsStorage();
    await saveSystemsPage(storage, 'lights');
    expect(await storage.getItem(SYSTEMS_STORAGE_KEY)).toBe(JSON.stringify({ page: 'lights' }));
    await expect(loadSystemsPage(storage)).resolves.toBe('lights');
  });

  it('defaults to FLIGHT from malformed JSON', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(SYSTEMS_STORAGE_KEY, '{not json');
    await expect(loadSystemsPage(storage)).resolves.toBe('flight');
  });

  it('defaults to FLIGHT from a page that does not exist', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(SYSTEMS_STORAGE_KEY, JSON.stringify({ page: 'overhead' }));
    await expect(loadSystemsPage(storage)).resolves.toBe('flight');
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
    await expect(loadSystemsPage(failing)).resolves.toBe('flight');
    await expect(saveSystemsPage(failing, 'ice')).resolves.toBeUndefined();
  });
});
