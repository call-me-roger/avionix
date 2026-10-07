import type React from 'react';

import type { PanelDescriptor } from '@/domain/panels/panel';
import { AUTOPILOT_PANEL, AutopilotPanel } from '@/features/panels/autopilot/AutopilotPanel';
import { CDU_PANEL, CduPanel } from '@/features/panels/cdu/CduPanel';
import { FLIGHT_DATA_PANEL, FlightDataPanel } from '@/features/panels/flight-data/FlightDataPanel';
import {
  INSTRUMENTS_PANEL,
  InstrumentsPanel,
} from '@/features/panels/instruments/InstrumentsPanel';
import { NAVIGATION_PANEL, NavigationPanel } from '@/features/panels/navigation/NavigationPanel';
import { RADIOS_PANEL, RadiosPanel } from '@/features/panels/radios/RadiosPanel';

export interface RegisteredPanel {
  descriptor: PanelDescriptor;
  Component: React.ComponentType;
}

/** Switcher order. A panel's id is persisted, so it is never reused for a different panel. */
export const PANELS: readonly RegisteredPanel[] = [
  { descriptor: INSTRUMENTS_PANEL, Component: InstrumentsPanel },
  { descriptor: RADIOS_PANEL, Component: RadiosPanel },
  { descriptor: AUTOPILOT_PANEL, Component: AutopilotPanel },
  { descriptor: NAVIGATION_PANEL, Component: NavigationPanel },
  { descriptor: CDU_PANEL, Component: CduPanel },
  { descriptor: FLIGHT_DATA_PANEL, Component: FlightDataPanel },
];

/** Stable by construction: `usePanelLayout` depends on this reference not changing. */
export const PANEL_IDS: readonly string[] = PANELS.map((panel) => panel.descriptor.id);

export function findPanel(panels: readonly RegisteredPanel[], id: string): RegisteredPanel | null {
  return panels.find((panel) => panel.descriptor.id === id) ?? null;
}
