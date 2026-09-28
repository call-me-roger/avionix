import { z } from 'zod';

import type { SettingsStorage } from '@/application/settings-store';

export const PANEL_LAYOUT_STORAGE_KEY = 'avionix.panels';

/** The one route that is not a panel. Reserved: no panel may use this id. */
export const SETUP_ROUTE = 'setup';

/**
 * Hidden ids rather than visible ones, so a panel added in a later release appears by default
 * instead of silently staying off (F-04 R13, spec decision 8).
 */
export interface PanelLayout {
  hidden: readonly string[];
  last: string;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { hidden: [], last: SETUP_ROUTE };

const storedSchema = z.object({ hidden: z.array(z.string()), last: z.string() });

export function normaliseLayout(layout: PanelLayout, knownIds: readonly string[]): PanelLayout {
  const hidden = [...new Set(layout.hidden.filter((id) => knownIds.includes(id)))];
  const last =
    layout.last === SETUP_ROUTE || knownIds.includes(layout.last) ? layout.last : SETUP_ROUTE;
  // A layout that hides everything (only reachable by editing storage) would leave a switcher
  // with Setup alone; show everything again instead.
  return { hidden: hidden.length >= knownIds.length ? [] : hidden, last };
}

export function visiblePanelIds(layout: PanelLayout, knownIds: readonly string[]): string[] {
  return knownIds.filter((id) => !layout.hidden.includes(id));
}

/** The route to show: Setup or an available panel as stored, else the first available panel. */
export function resolveRoute(last: string, availableIds: readonly string[]): string {
  if (last === SETUP_ROUTE || availableIds.includes(last)) {
    return last;
  }
  return availableIds[0] ?? SETUP_ROUTE;
}

export function canHidePanel(
  layout: PanelLayout,
  knownIds: readonly string[],
  id: string,
): boolean {
  return (
    knownIds.includes(id) &&
    !layout.hidden.includes(id) &&
    visiblePanelIds(layout, knownIds).length > 1
  );
}

export function setPanelHidden(
  layout: PanelLayout,
  knownIds: readonly string[],
  id: string,
  hidden: boolean,
): PanelLayout {
  if (hidden) {
    return canHidePanel(layout, knownIds, id)
      ? { ...layout, hidden: [...layout.hidden, id] }
      : layout;
  }
  return layout.hidden.includes(id)
    ? { ...layout, hidden: layout.hidden.filter((hiddenId) => hiddenId !== id) }
    : layout;
}

export async function loadPanelLayout(
  storage: SettingsStorage,
  knownIds: readonly string[],
): Promise<PanelLayout> {
  try {
    const raw = await storage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_PANEL_LAYOUT;
    }
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? normaliseLayout(parsed.data, knownIds) : DEFAULT_PANEL_LAYOUT;
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}

export async function savePanelLayout(
  storage: SettingsStorage,
  layout: PanelLayout,
): Promise<void> {
  try {
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: layout.hidden, last: layout.last }),
    );
  } catch {
    // Best effort, like the theme preference: a failed save must never break the UI.
  }
}
