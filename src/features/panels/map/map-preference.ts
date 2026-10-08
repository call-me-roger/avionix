import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import {
  DEFAULT_MAP_ORIENTATION,
  DEFAULT_MAP_RANGE,
  MAP_RANGES,
  type MapOrientation,
  type MapRange,
} from '@/domain/map/catalogue';

export const MAP_STORAGE_KEY = 'avionix.map';

export interface MapPreference {
  orientation: MapOrientation;
  range: MapRange;
}

export const DEFAULT_MAP_PREFERENCE: MapPreference = {
  orientation: DEFAULT_MAP_ORIENTATION,
  range: DEFAULT_MAP_RANGE,
};

const orientationSchema = z.enum(['north', 'track']);
const rangeSchema = z
  .number()
  .refine((value): value is MapRange => (MAP_RANGES as readonly number[]).includes(value));

/** Spec §4.9. Best effort, field by field: anything unreadable is the default. */
export async function loadMapPreference(storage: SettingsStorage): Promise<MapPreference> {
  try {
    const raw = await storage.getItem(MAP_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_MAP_PREFERENCE;
    }
    const stored: unknown = JSON.parse(raw);
    const record =
      typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
    const orientation = orientationSchema.safeParse(record.orientation);
    const range = rangeSchema.safeParse(record.range);
    return {
      orientation: orientation.success ? orientation.data : DEFAULT_MAP_ORIENTATION,
      range: range.success ? (range.data as MapRange) : DEFAULT_MAP_RANGE,
    };
  } catch {
    return DEFAULT_MAP_PREFERENCE;
  }
}

export async function saveMapPreference(
  storage: SettingsStorage,
  preference: MapPreference,
): Promise<void> {
  try {
    await storage.setItem(MAP_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
