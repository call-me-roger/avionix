import { TWO_COLUMN_MIN_WIDTH } from '@/domain/panels/device-layout';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { SYSTEMS_FEATURES } from '@/domain/systems/controls';

/** Descriptor id `systems`, the ten systems features, every device and orientation (spec §4.8). */
export const SYSTEMS_PANEL: PanelDescriptor = {
  id: 'systems',
  title: 'Systems',
  features: SYSTEMS_FEATURES,
  supports: EVERYWHERE,
};

export type SystemsPage = 'engine' | 'lights' | 'flight' | 'ice';

/** The phone's page keys, in order (spec §4.7). */
export const SYSTEMS_PAGES: readonly { id: SystemsPage; legend: string }[] = [
  { id: 'engine', legend: 'ENGINE' },
  { id: 'lights', legend: 'LIGHTS' },
  { id: 'flight', legend: 'FLIGHT' },
  { id: 'ice', legend: 'ICE' },
];

export const DEFAULT_SYSTEMS_PAGE: SystemsPage = 'flight';

/** Spec §4.7's wide layout threshold: the same breakpoint the CDU and Navigation use. */
export const WIDE_MIN_WIDTH = TWO_COLUMN_MIN_WIDTH;
