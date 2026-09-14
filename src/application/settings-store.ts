import { z } from 'zod';

import { DEFAULT_PORT } from '@/domain/connection/connection-config';

export interface SettingsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ConnectionSettings {
  host: string;
  port: number;
}

export const DEFAULT_CONNECTION_SETTINGS: ConnectionSettings = { host: '', port: DEFAULT_PORT };

const STORAGE_KEY = 'avionix.connection';

const settingsSchema = z.object({ host: z.string(), port: z.number().int() });

export async function loadConnectionSettings(
  storage: SettingsStorage,
): Promise<ConnectionSettings> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_CONNECTION_SETTINGS;
    }
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_CONNECTION_SETTINGS;
  } catch {
    return DEFAULT_CONNECTION_SETTINGS;
  }
}

export async function saveConnectionSettings(
  storage: SettingsStorage,
  settings: ConnectionSettings,
): Promise<void> {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best effort; a failed save must never break connecting.
  }
}

export function createMemorySettingsStorage(): SettingsStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
  };
}
