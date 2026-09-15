import { createPairingTokenStore, pairingTokenKey } from '@/application/pairing-token-store';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';

describe('pairingTokenKey', () => {
  it('namespaces by host and port and lowercases the host', () => {
    expect(pairingTokenKey('PC.local', 8080)).toBe('avionix.pairing.pc.local:8080');
    expect(pairingTokenKey('pc.local', 8080)).toBe(pairingTokenKey('PC.LOCAL', 8080));
    expect(pairingTokenKey('pc.local', 8081)).not.toBe(pairingTokenKey('pc.local', 8080));
  });
});

describe('createPairingTokenStore', () => {
  it('round-trips a token per connector', async () => {
    const store = createPairingTokenStore(createMemorySettingsStorage());
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await store.set('pc.local', 8080, 'tok-a');
    await store.set('other.local', 8080, 'tok-b');
    await expect(store.get('pc.local', 8080)).resolves.toBe('tok-a');
    await expect(store.get('PC.LOCAL', 8080)).resolves.toBe('tok-a');
    await expect(store.get('other.local', 8080)).resolves.toBe('tok-b');
    await expect(store.get('pc.local', 8081)).resolves.toBeNull();
  });

  it('clear makes get return null again', async () => {
    const store = createPairingTokenStore(createMemorySettingsStorage());
    await store.set('pc.local', 8080, 'tok-a');
    await store.clear('pc.local', 8080);
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
  });

  it('treats a garbage or empty stored value as null', async () => {
    const storage = createMemorySettingsStorage();
    const store = createPairingTokenStore(storage);
    await storage.setItem(pairingTokenKey('pc.local', 8080), 'not json');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await storage.setItem(pairingTokenKey('pc.local', 8080), '{"token":42}');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await storage.setItem(pairingTokenKey('pc.local', 8080), '{"token":"   "}');
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
  });

  it('never throws when the storage fails', async () => {
    const broken: SettingsStorage = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };
    const store = createPairingTokenStore(broken);
    await expect(store.get('pc.local', 8080)).resolves.toBeNull();
    await expect(store.set('pc.local', 8080, 'tok')).resolves.toBeUndefined();
    await expect(store.clear('pc.local', 8080)).resolves.toBeUndefined();
  });
});
