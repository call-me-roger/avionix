import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  loadThemePreference,
  resolveThemeMode,
  saveThemePreference,
} from '@/theme/theme-preference';

describe('THEME_PREFERENCES', () => {
  it('lists the supported preferences in a stable order', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'auto-night', 'light', 'dark', 'night']);
  });
});

describe('resolveThemeMode', () => {
  it('follows the OS scheme when the preference is system', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
  });

  it('defaults to light when the OS scheme is unknown', () => {
    expect(resolveThemeMode('system', null)).toBe('light');
    expect(resolveThemeMode('system', undefined)).toBe('light');
  });

  it('uses the explicit preference regardless of the OS scheme', () => {
    expect(resolveThemeMode('light', 'dark')).toBe('light');
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
  });

  it('follows the OS scheme between light and night for auto-night', () => {
    expect(resolveThemeMode('auto-night', 'dark')).toBe('night');
    expect(resolveThemeMode('auto-night', 'light')).toBe('light');
    expect(resolveThemeMode('auto-night', null)).toBe('light');
  });

  it('uses night regardless of the OS scheme when night is chosen', () => {
    expect(resolveThemeMode('night', 'light')).toBe('night');
  });
});

describe('theme preference persistence', () => {
  it('defaults to system when nothing is stored', async () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
    await expect(loadThemePreference(createMemorySettingsStorage())).resolves.toBe('system');
  });

  it('round-trips the preference under the documented key', async () => {
    const storage = createMemorySettingsStorage();
    await saveThemePreference(storage, 'dark');
    expect(await storage.getItem(THEME_STORAGE_KEY)).toBe(JSON.stringify({ preference: 'dark' }));
    await expect(loadThemePreference(storage)).resolves.toBe('dark');
  });

  it.each(['{bad json', JSON.stringify({ preference: 'sepia' }), JSON.stringify({ mode: 'dark' })])(
    'falls back to system on corrupt data %s',
    async (raw) => {
      const storage = createMemorySettingsStorage();
      await storage.setItem(THEME_STORAGE_KEY, raw);
      await expect(loadThemePreference(storage)).resolves.toBe('system');
    },
  );

  it('swallows storage failures on read and write', async () => {
    const failing = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
    };
    await expect(loadThemePreference(failing)).resolves.toBe('system');
    await expect(saveThemePreference(failing, 'light')).resolves.toBeUndefined();
  });

  it.each(['auto-night', 'night'] as const)('round-trips %s', async (preference) => {
    const storage = createMemorySettingsStorage();
    await saveThemePreference(storage, preference);
    await expect(loadThemePreference(storage)).resolves.toBe(preference);
  });

  it('still reads a preference stored before night existed', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ preference: 'dark' }));
    await expect(loadThemePreference(storage)).resolves.toBe('dark');
  });
});
