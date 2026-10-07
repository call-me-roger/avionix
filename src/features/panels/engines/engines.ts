import { ENGINES_FEATURES } from '@/domain/engines/catalogue';
import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';

/** Descriptor id `engines`, the four read-only features, every device and orientation (§4.11). */
export const ENGINES_PANEL: PanelDescriptor = {
  id: 'engines',
  title: 'Engines',
  features: ENGINES_FEATURES,
  supports: EVERYWHERE,
};

export type EnginesPage = 'engines' | 'fuel' | 'elec';

/** The phone's page keys, in order (spec §4.10). */
export const ENGINES_PAGES: readonly { id: EnginesPage; legend: string }[] = [
  { id: 'engines', legend: 'ENGINES' },
  { id: 'fuel', legend: 'FUEL' },
  { id: 'elec', legend: 'ELEC' },
];

export const DEFAULT_ENGINES_PAGE: EnginesPage = 'engines';

/** Spec §4.10's wide layout threshold: the breakpoint Systems, the CDU and Navigation use. */
export const WIDE_MIN_WIDTH = TWO_COLUMN_MIN_WIDTH;

/** A dial never grows past this, however few engines share the row. */
export const MAX_DIAL_SIZE = 180;
