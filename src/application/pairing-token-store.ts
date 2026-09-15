import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';

export interface PairingTokenStore {
  get(host: string, port: number): Promise<string | null>;
  set(host: string, port: number, token: string): Promise<void>;
  clear(host: string, port: number): Promise<void>;
}

/** One key per connector. The host is lowercased so `PC` and `pc` share a token. */
export function pairingTokenKey(host: string, port: number): string {
  return `avionix.pairing.${host.trim().toLowerCase()}:${port}`;
}

// Stored as JSON so a value written by something else reads back as "no token" instead of
// being handed to the connector as a bearer token.
const storedTokenSchema = z.object({ token: z.string() });

export function createPairingTokenStore(storage: SettingsStorage): PairingTokenStore {
  return {
    async get(host, port) {
      try {
        const raw = await storage.getItem(pairingTokenKey(host, port));
        if (raw === null) {
          return null;
        }
        const parsed = storedTokenSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
          return null;
        }
        const token = parsed.data.token.trim();
        return token.length === 0 ? null : token;
      } catch {
        // Missing, unreadable or malformed: the app asks for a code again.
        return null;
      }
    },
    async set(host, port, token) {
      try {
        await storage.setItem(pairingTokenKey(host, port), JSON.stringify({ token }));
      } catch {
        // Persistence is best effort; the in-memory token still works for this run.
      }
    },
    async clear(host, port) {
      try {
        // The SettingsStorage port has no remove, so an empty token stands for "none".
        await storage.setItem(pairingTokenKey(host, port), JSON.stringify({ token: '' }));
      } catch {
        // Best effort, as above.
      }
    },
  };
}
