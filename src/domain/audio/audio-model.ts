import {
  AUDIO_STATE_NAMES,
  type ComNumber,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  type MicSpec,
  type MonitorSpec,
  TRANSMIT,
  comForSelection,
} from '@/domain/audio/catalogue';
import type { Marker } from '@/domain/navigation/hsi';

/**
 * The session as the audio domain reads it. F-12's three answers: a name is resolved (`has`),
 * definitively absent (`missing`), or neither yet (unchecked, right after connect). Only `missing`
 * ever produces a sentence.
 */
export interface AudioReader {
  has: (name: string) => boolean;
  missing: (name: string) => boolean;
  number: (name: string) => number | null;
}

export interface MicKey {
  spec: MicSpec;
  enabled: boolean;
  selected: boolean;
}

/** `auto`: heard because it is the transmitting COM and X-Plane's auto-listen is on (spec §4.3). */
export type Listening = 'on' | 'off' | 'auto' | 'unknown';

export interface MonitorKey {
  spec: MonitorSpec;
  enabled: boolean;
  listening: Listening;
}

export interface AudioModel {
  /** `waiting`: nothing drawable yet and not everything known missing; say nothing. */
  status: 'waiting' | 'unavailable' | 'ready';
  transmitting: ComNumber | null;
  /** Empty when the transmit selection did not resolve. */
  mics: readonly MicKey[];
  /** The receivers whose flag resolved, in catalogue order. */
  monitors: readonly MonitorKey[];
  /** Null unless all three lamps resolved. */
  lamps: Record<Marker, boolean> | null;
  /** The transmitting COM when it is known not to be heard (spec §4.4). */
  notHeard: ComNumber | null;
  /** Legends of keys whose state or a command is definitively missing: MIC keys first. */
  missing: readonly string[];
}

const UNAVAILABLE: AudioModel = {
  status: 'unavailable',
  transmitting: null,
  mics: [],
  monitors: [],
  lamps: null,
  notHeard: null,
  missing: [],
};

export function audioModel(read: AudioReader): AudioModel {
  if (AUDIO_STATE_NAMES.every((name) => read.missing(name))) {
    return UNAVAILABLE;
  }
  const selectionShown = read.has(TRANSMIT.selection);
  const transmitting = selectionShown ? comForSelection(read.number(TRANSMIT.selection)) : null;
  const auto = read.has(TRANSMIT.autoListen) && read.number(TRANSMIT.autoListen) === 1;

  const mics = selectionShown
    ? MICS.map((spec) => ({
        spec,
        enabled: read.has(spec.command),
        selected: transmitting === spec.com,
      }))
    : [];

  const listening = (spec: MonitorSpec): Listening => {
    if (spec.com !== undefined && auto && transmitting === spec.com) {
      return 'auto';
    }
    const value = read.number(spec.state);
    if (value === null || !Number.isFinite(value)) {
      return 'unknown';
    }
    return value >= 0.5 ? 'on' : 'off';
  };
  const monitors = MONITORS.filter((spec) => read.has(spec.state)).map((spec) => ({
    spec,
    enabled: read.has(spec.on) && read.has(spec.off),
    listening: listening(spec),
  }));

  const transmitKey = monitors.find(
    (key) => transmitting !== null && key.spec.com === transmitting,
  );
  const missing = [
    ...MICS.filter((spec) => read.missing(TRANSMIT.selection) || read.missing(spec.command)).map(
      (spec) => spec.legend,
    ),
    ...MONITORS.filter((spec) =>
      [spec.state, spec.on, spec.off].some((name) => read.missing(name)),
    ).map((spec) => spec.legend),
  ];
  const lamps = MARKER_LAMPS.every((lamp) => read.has(lamp.state))
    ? (Object.fromEntries(
        MARKER_LAMPS.map((lamp) => [lamp.marker, read.number(lamp.state) === 1]),
      ) as Record<Marker, boolean>)
    : null;

  return {
    status: mics.length === 0 && monitors.length === 0 ? 'waiting' : 'ready',
    transmitting,
    mics,
    monitors,
    lamps,
    notHeard: transmitKey?.listening === 'off' ? transmitting : null,
    missing,
  };
}
