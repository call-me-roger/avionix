import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';

export const HAPTICS_STORAGE_KEY = 'avionix.haptics';

const storedSchema = z.object({ enabled: z.boolean() });

export async function loadHapticsPreference(storage: SettingsStorage): Promise<boolean> {
  try {
    const raw = await storage.getItem(HAPTICS_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.enabled : true;
  } catch {
    return true;
  }
}

export async function saveHapticsPreference(
  storage: SettingsStorage,
  enabled: boolean,
): Promise<void> {
  try {
    await storage.setItem(HAPTICS_STORAGE_KEY, JSON.stringify({ enabled }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
