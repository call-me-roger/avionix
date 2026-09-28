import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_UNITS,
  DISTANCE_UNITS,
  FUEL_UNITS,
  TEMPERATURE_UNITS,
  type UnitPreferences,
} from '@/domain/units/units';

export const UNITS_STORAGE_KEY = 'avionix.units';

/** Each field falls back on its own, so one bad value does not reset the others. */
const storedSchema = z.object({
  fuel: z.enum([...FUEL_UNITS]).catch(DEFAULT_UNITS.fuel),
  temperature: z.enum([...TEMPERATURE_UNITS]).catch(DEFAULT_UNITS.temperature),
  distance: z.enum([...DISTANCE_UNITS]).catch(DEFAULT_UNITS.distance),
});

export async function loadUnitPreferences(storage: SettingsStorage): Promise<UnitPreferences> {
  try {
    const raw = await storage.getItem(UNITS_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_UNITS;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_UNITS;
  } catch {
    return DEFAULT_UNITS;
  }
}

export async function saveUnitPreferences(
  storage: SettingsStorage,
  preferences: UnitPreferences,
): Promise<void> {
  try {
    await storage.setItem(UNITS_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Best effort, like the theme preference: a failed save must never break the UI.
  }
}
