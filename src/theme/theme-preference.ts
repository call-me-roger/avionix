import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';
import type { ThemeMode } from '@/theme/tokens';

export const THEME_PREFERENCES = ['system', 'auto-night', 'light', 'dark', 'night'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

export const THEME_STORAGE_KEY = 'avionix.theme';

const storedSchema = z.object({ preference: z.enum([...THEME_PREFERENCES]) });

/**
 * `system` follows the device between light and dark; `auto-night` follows it between light and
 * night, which is how F-04 R6's night presentation "can follow the device".
 */
export function resolveThemeMode(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeMode {
  switch (preference) {
    case 'system':
      return systemScheme === 'dark' ? 'dark' : 'light';
    case 'auto-night':
      return systemScheme === 'dark' ? 'night' : 'light';
    default:
      return preference;
  }
}

export async function loadThemePreference(storage: SettingsStorage): Promise<ThemePreference> {
  try {
    const raw = await storage.getItem(THEME_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_THEME_PREFERENCE;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.preference : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export async function saveThemePreference(
  storage: SettingsStorage,
  preference: ThemePreference,
): Promise<void> {
  try {
    await storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ preference }));
  } catch {
    // Best effort: a failed save must never break the UI.
  }
}
