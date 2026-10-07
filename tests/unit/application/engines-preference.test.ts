import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  ENGINES_STORAGE_KEY,
  loadEnginesPage,
  saveEnginesPage,
} from '@/features/panels/engines/engines-preference';

describe('the remembered Engines page (spec §4.10)', () => {
  it('starts on ENGINES and remembers a choice', async () => {
    const storage = createMemorySettingsStorage();
    expect(await loadEnginesPage(storage)).toBe('engines');
    await saveEnginesPage(storage, 'fuel');
    expect(await storage.getItem(ENGINES_STORAGE_KEY)).toBe('{"page":"fuel"}');
    expect(await loadEnginesPage(storage)).toBe('fuel');
  });

  it('falls back to ENGINES on anything unreadable', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(ENGINES_STORAGE_KEY, '{"page":"cabin"}');
    expect(await loadEnginesPage(storage)).toBe('engines');
    await storage.setItem(ENGINES_STORAGE_KEY, 'not json');
    expect(await loadEnginesPage(storage)).toBe('engines');
  });
});
