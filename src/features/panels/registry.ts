import type React from 'react';

import type { PanelDescriptor } from '@/domain/panels/panel';
import { FLIGHT_DATA_PANEL, FlightDataPanel } from '@/features/panels/flight-data/FlightDataPanel';
import { HEADING_PANEL, HeadingPanel } from '@/features/panels/heading/HeadingPanel';
import {
  INSTRUMENTS_PANEL,
  InstrumentsPanel,
} from '@/features/panels/instruments/InstrumentsPanel';

export interface RegisteredPanel {
  descriptor: PanelDescriptor;
  Component: React.ComponentType;
}

/** Switcher order. A panel's id is persisted, so it is never reused for a different panel. */
export const PANELS: readonly RegisteredPanel[] = [
  { descriptor: INSTRUMENTS_PANEL, Component: InstrumentsPanel },
  { descriptor: FLIGHT_DATA_PANEL, Component: FlightDataPanel },
  { descriptor: HEADING_PANEL, Component: HeadingPanel },
];

/** Stable by construction: `usePanelLayout` depends on this reference not changing. */
export const PANEL_IDS: readonly string[] = PANELS.map((panel) => panel.descriptor.id);

export function findPanel(panels: readonly RegisteredPanel[], id: string): RegisteredPanel | null {
  return panels.find((panel) => panel.descriptor.id === id) ?? null;
}
