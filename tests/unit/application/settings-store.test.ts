import {
  DEFAULT_CONNECTION_SETTINGS,
  createMemorySettingsStorage,
  loadConnectionSettings,
  saveConnectionSettings,
} from '@/application/settings-store';

describe('connection settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const storage = createMemorySettingsStorage();
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
    expect(DEFAULT_CONNECTION_SETTINGS).toEqual({ host: '', port: 8086 });
  });

  it('round-trips host and port', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '192.168.1.100', port: 8090 });
    await expect(loadConnectionSettings(storage)).resolves.toEqual({
      host: '192.168.1.100',
      port: 8090,
    });
  });

  it('falls back to defaults on corrupt data', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem('avionix.connection', '{bad json');
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
    await storage.setItem('avionix.connection', JSON.stringify({ host: 5, port: 'x' }));
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
  });

  it('swallows storage read failures and returns defaults', async () => {
    const storage = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => undefined,
    };
    await expect(loadConnectionSettings(storage)).resolves.toEqual(DEFAULT_CONNECTION_SETTINGS);
  });
});
