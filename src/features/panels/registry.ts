import type React from 'react';

import type { PanelDescriptor } from '@/domain/panels/panel';
import { BASIC_DATA_PANEL, BasicDataPanel } from '@/features/panels/basic-data/BasicDataPanel';
import { HEADING_PANEL, HeadingPanel } from '@/features/panels/heading/HeadingPanel';

export interface RegisteredPanel {
  descriptor: PanelDescriptor;
  Component: React.ComponentType;
}

/** Switcher order. A panel's id is persisted, so it is never reused for a different panel. */
export const PANELS: readonly RegisteredPanel[] = [
  { descriptor: BASIC_DATA_PANEL, Component: BasicDataPanel },
  { descriptor: HEADING_PANEL, Component: HeadingPanel },
];

/** Stable by construction: `usePanelLayout` depends on this reference not changing. */
export const PANEL_IDS: readonly string[] = PANELS.map((panel) => panel.descriptor.id);

export function findPanel(panels: readonly RegisteredPanel[], id: string): RegisteredPanel | null {
  return panels.find((panel) => panel.descriptor.id === id) ?? null;
}
