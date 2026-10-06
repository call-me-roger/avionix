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
  /** The flight data strip (F-11) docked under the status bar on every other panel. */
  strip: boolean;
}

export const DEFAULT_PANEL_LAYOUT: PanelLayout = { hidden: [], last: SETUP_ROUTE, strip: true };

/**
 * Panels that were replaced, and what replaced them: `basic-data` by the flight data strip's own
 * panel, and the interim `heading` panel by F-20's Autopilot panel. A stored `last` entry for a
 * retired id is rewritten before unknown ids are dropped, so a pilot is not thrown back to Setup
 * because a placeholder panel was retired. A retired id in `hidden` is not rewritten;
 * `normaliseLayout` drops it like any other unknown id instead, so the successor is not carried
 * over hidden.
 */
export const RETIRED_PANEL_IDS: Readonly<Record<string, string>> = {
  'basic-data': 'flight-data',
  heading: 'autopilot',
};

const storedSchema = z.object({
  hidden: z.array(z.string()),
  last: z.string(),
  strip: z.boolean().optional(),
});

/**
 * Used for `last` only (`hidden` is handled separately in `normaliseLayout`, which drops a
 * retired id rather than mapping it). A retired id is mapped only when it is not itself still a
 * known id: while `basic-data` is still registered as a panel (until it is replaced), a stored
 * `last` entry for it is left alone, so a pilot mid-launch is not moved off a panel that is
 * still there.
 */
function successor(id: string, knownIds: readonly string[]): string {
  return knownIds.includes(id) ? id : (RETIRED_PANEL_IDS[id] ?? id);
}

export function normaliseLayout(layout: PanelLayout, knownIds: readonly string[]): PanelLayout {
  // A retired id in `hidden` is not rewritten to its successor: it is simply dropped, like any
  // other unknown id, so a panel that replaces a retired one is not carried over hidden and
  // appears by default (F-04's rule that a new panel is shown; controller ruling on final-fixes
  // #7, overriding the spec's earlier migration of `hidden`).
  const hidden = [...new Set(layout.hidden.filter((id) => knownIds.includes(id)))];
  const mappedLast = successor(layout.last, knownIds);
  const last =
    mappedLast === SETUP_ROUTE || knownIds.includes(mappedLast) ? mappedLast : SETUP_ROUTE;
  // A layout that hides everything (only reachable by editing storage) would leave a switcher
  // with Setup alone; show everything again instead.
  return {
    hidden: hidden.length >= knownIds.length ? [] : hidden,
    last,
    strip: layout.strip,
  };
}

export function setStripShown(layout: PanelLayout, shown: boolean): PanelLayout {
  return layout.strip === shown ? layout : { ...layout, strip: shown };
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
    return parsed.success
      ? normaliseLayout({ ...parsed.data, strip: parsed.data.strip ?? true }, knownIds)
      : DEFAULT_PANEL_LAYOUT;
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
      JSON.stringify({ hidden: layout.hidden, last: layout.last, strip: layout.strip }),
    );
  } catch {
    // Best effort, like the theme preference: a failed save must never break the UI.
  }
}
