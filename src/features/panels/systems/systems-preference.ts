import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import { DEFAULT_SYSTEMS_PAGE, type SystemsPage } from '@/features/panels/systems/systems';

export const SYSTEMS_STORAGE_KEY = 'avionix.systems';

const storedSchema = z.object({ page: z.enum(['engine', 'lights', 'flight', 'ice']) });

/** Which page the panel shows on this device (spec §4.7). Best effort: anything unreadable is FLIGHT. */
export async function loadSystemsPage(storage: SettingsStorage): Promise<SystemsPage> {
  try {
    const raw = await storage.getItem(SYSTEMS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_SYSTEMS_PAGE;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.page : DEFAULT_SYSTEMS_PAGE;
  } catch {
    return DEFAULT_SYSTEMS_PAGE;
  }
}

export async function saveSystemsPage(storage: SettingsStorage, page: SystemsPage): Promise<void> {
  try {
    await storage.setItem(SYSTEMS_STORAGE_KEY, JSON.stringify({ page }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
