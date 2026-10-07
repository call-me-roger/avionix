import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import { DEFAULT_ENGINES_PAGE, type EnginesPage } from '@/features/panels/engines/engines';

export const ENGINES_STORAGE_KEY = 'avionix.engines';

const storedSchema = z.object({ page: z.enum(['engines', 'fuel', 'elec']) });

/** Which page the panel shows on this device (spec §4.10). Best effort: anything unreadable is ENGINES. */
export async function loadEnginesPage(storage: SettingsStorage): Promise<EnginesPage> {
  try {
    const raw = await storage.getItem(ENGINES_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_ENGINES_PAGE;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.page : DEFAULT_ENGINES_PAGE;
  } catch {
    return DEFAULT_ENGINES_PAGE;
  }
}

export async function saveEnginesPage(storage: SettingsStorage, page: EnginesPage): Promise<void> {
  try {
    await storage.setItem(ENGINES_STORAGE_KEY, JSON.stringify({ page }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
