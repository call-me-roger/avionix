import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  PRESENTATIONS,
  type Presentation,
  type PresentationPreferences,
} from '@/domain/instruments/presentation';

export const INSTRUMENTS_STORAGE_KEY = 'avionix.instruments';

const presentation = z.enum([...PRESENTATIONS]);

/** Per field, and per aircraft: one bad entry never costs the others (as `avionix.units`). */
const storedSchema = z.object({
  last: presentation.catch(DEFAULT_PRESENTATION_PREFERENCES.last),
  byAircraft: z.record(z.string(), z.unknown()).catch({}),
});

export async function loadInstrumentPreferences(
  storage: SettingsStorage,
): Promise<PresentationPreferences> {
  try {
    const raw = await storage.getItem(INSTRUMENTS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_PRESENTATION_PREFERENCES;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return DEFAULT_PRESENTATION_PREFERENCES;
    }
    const byAircraft: Record<string, Presentation> = {};
    for (const [key, value] of Object.entries(parsed.data.byAircraft)) {
      const choice = presentation.safeParse(value);
      if (choice.success) {
        byAircraft[key] = choice.data;
      }
    }
    return { last: parsed.data.last, byAircraft };
  } catch {
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

export async function saveInstrumentPreferences(
  storage: SettingsStorage,
  prefs: PresentationPreferences,
): Promise<void> {
  try {
    await storage.setItem(INSTRUMENTS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Best effort, like the unit preferences: a failed save must never break the panel.
  }
}
