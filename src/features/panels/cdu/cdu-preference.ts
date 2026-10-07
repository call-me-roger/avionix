import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import type { CduUnit } from '@/domain/cdu/keys';

export const CDU_STORAGE_KEY = 'avionix.cdu';

const storedSchema = z.object({ unit: z.union([z.literal(1), z.literal(2)]) });

/** Which CDU the panel shows on this device (spec §4.6). Best effort: anything unreadable is CDU 1. */
export async function loadCduPreference(storage: SettingsStorage): Promise<CduUnit> {
  try {
    const raw = await storage.getItem(CDU_STORAGE_KEY);
    if (raw === null) {
      return 1;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.unit : 1;
  } catch {
    return 1;
  }
}

export async function saveCduPreference(storage: SettingsStorage, unit: CduUnit): Promise<void> {
  try {
    await storage.setItem(CDU_STORAGE_KEY, JSON.stringify({ unit }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
