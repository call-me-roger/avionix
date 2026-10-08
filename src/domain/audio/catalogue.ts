import type { Marker } from '@/domain/navigation/hsi';

/**
 * F-23's catalogue: X-Plane's generic (pilot-side) audio panel. Every name is Laminar's, verified
 * against `DataRefs.txt`, `Commands.txt` and the live 12.4.3 DataRef database (spec §3). The
 * profile builds its features from this file and the Radios panel draws from it, so a name lives
 * in one place only.
 */

export const FEATURE_AUDIO_TRANSMIT = 'audio-transmit';
export const FEATURE_AUDIO_MONITOR = 'audio-monitor';
export const FEATURE_AUDIO_MARKER = 'audio-marker';

/** The audio features, in profile order. */
export const AUDIO_FEATURES: readonly string[] = [
  FEATURE_AUDIO_TRANSMIT,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_MARKER,
];

const ACTUATORS = 'sim/cockpit2/radios/actuators/';
const PANEL = 'sim/audio_panel/';

export type ComNumber = 1 | 2;

export const TRANSMIT = {
  /** 6 = COM1, 7 = COM2; Laminar: "0 is never a valid value". */
  selection: `${ACTUATORS}audio_com_selection`,
  /** 1: the transmitting COM is heard whatever its own listen flag says. */
  autoListen: `${ACTUATORS}audio_selection_com_auto`,
} as const;

/** A MIC key: the standard transmit command, which also makes X-Plane select that COM's listener. */
export interface MicSpec {
  key: 'mic1' | 'mic2';
  com: ComNumber;
  legend: string;
  /** `TRANSMIT.selection`'s value once X-Plane has adopted it. */
  value: number;
  command: string;
}

export const MICS: readonly MicSpec[] = [
  { key: 'mic1', com: 1, legend: 'COM1 MIC', value: 6, command: `${PANEL}transmit_audio_com1` },
  { key: 'mic2', com: 2, legend: 'COM2 MIC', value: 7, command: `${PANEL}transmit_audio_com2` },
];

/** A monitor key: one listen flag and its explicit on/off commands (never the toggles). */
export interface MonitorSpec {
  /** Unique across the panel; read-back keys and test ids derive from it. */
  key: string;
  legend: string;
  /** In the pilot's words, for sentences and screen readers ("COM1", "the ADF"). */
  name: string;
  featureId: string;
  state: string;
  on: string;
  off: string;
  /** Set on the two COM receivers: auto-listen applies to them only. */
  com?: ComNumber;
}

function monitor(
  key: string,
  legend: string,
  name: string,
  state: string,
  stem: string,
  featureId = FEATURE_AUDIO_MONITOR,
  com?: ComNumber,
): MonitorSpec {
  return {
    key,
    legend,
    name,
    featureId,
    state: `${ACTUATORS}${state}`,
    on: `${PANEL}monitor_audio_${stem}_on`,
    off: `${PANEL}monitor_audio_${stem}_off`,
    ...(com === undefined ? {} : { com }),
  };
}

/** In the GMA 340's order. DME is the dedicated DME receiver, which `monitor_audio_dme` predates. */
export const MONITORS: readonly MonitorSpec[] = [
  monitor('com1', 'COM1', 'COM1', 'audio_selection_com1', 'com1', FEATURE_AUDIO_MONITOR, 1),
  monitor('com2', 'COM2', 'COM2', 'audio_selection_com2', 'com2', FEATURE_AUDIO_MONITOR, 2),
  monitor('nav1', 'NAV1', 'NAV1', 'audio_selection_nav1', 'nav1'),
  monitor('nav2', 'NAV2', 'NAV2', 'audio_selection_nav2', 'nav2'),
  monitor('adf', 'ADF', 'the ADF', 'audio_selection_adf1', 'adf1'),
  monitor('dme', 'DME', 'the DME', 'audio_dme_enabled', 'dme'),
  monitor('mkr', 'MKR', 'the marker beacons', 'audio_marker_enabled', 'mkr', FEATURE_AUDIO_MARKER),
];

/** The O/M/I lamps: the same DataRefs `nav-aids` reads for the HSI and PFD. */
export const MARKER_LAMPS: readonly { marker: Marker; state: string }[] = [
  { marker: 'outer', state: 'sim/cockpit2/radios/indicators/outer_marker_lit' },
  { marker: 'middle', state: 'sim/cockpit2/radios/indicators/middle_marker_lit' },
  { marker: 'inner', state: 'sim/cockpit2/radios/indicators/inner_marker_lit' },
];

/** Every name that draws a key: when all are definitively missing, the panel has no audio (R6). */
export const AUDIO_STATE_NAMES: readonly string[] = [
  TRANSMIT.selection,
  ...MONITORS.map((spec) => spec.state),
];

/** 6 → COM1, 7 → COM2; anything else is no COM at all. */
export function comForSelection(value: number | null): ComNumber | null {
  if (value === 6) {
    return 1;
  }
  return value === 7 ? 2 : null;
}
