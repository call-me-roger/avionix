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
import { numberAt, switchOn } from '@/domain/systems/readouts';

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
  /**
   * The selection's value has arrived (any finite number). Until it does, both MIC keys are inert:
   * the COM in fact transmitting would look unselected, and pressing it would mute the other COM.
   */
  selectionKnown: boolean;
  /** Empty when the transmit selection did not resolve. */
  mics: readonly MicKey[];
  /** The receivers whose flag resolved, in catalogue order. */
  monitors: readonly MonitorKey[];
  /** Null unless all three lamps resolved and their values arrived. */
  lamps: Record<Marker, boolean> | null;
  /** The transmitting COM when it is known not to be heard (spec §4.4). */
  notHeard: ComNumber | null;
  /** Legends of keys whose state or a command is definitively missing: MIC keys first. */
  missing: readonly string[];
}

/** On above one half, as every Systems switch reads (F-12); null while the value has not arrived. */
function on(read: AudioReader, name: string): boolean | null {
  return switchOn(read.number(name) ?? undefined, 0);
}

const UNAVAILABLE: AudioModel = {
  status: 'unavailable',
  transmitting: null,
  selectionKnown: false,
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
  const selectionValue = selectionShown
    ? numberAt(read.number(TRANSMIT.selection) ?? undefined, 0)
    : null;
  const selectionKnown = selectionValue !== null;
  const transmitting = comForSelection(selectionValue);
  // A definitively missing auto flag counts as off (§4.3). Until it is known (unchecked, or
  // resolved with no value yet) the transmitting COM's listening is unknown: its key is inert and
  // no "not heard" line is claimed.
  const auto: boolean | null = read.missing(TRANSMIT.autoListen)
    ? false
    : read.has(TRANSMIT.autoListen)
      ? on(read, TRANSMIT.autoListen)
      : null;

  const mics = selectionShown
    ? MICS.map((spec) => ({
        spec,
        enabled: read.has(spec.command) && selectionKnown,
        selected: transmitting === spec.com,
      }))
    : [];

  const listening = (spec: MonitorSpec): Listening => {
    if (spec.com !== undefined && transmitting === spec.com && auto !== false) {
      return auto === null ? 'unknown' : 'auto';
    }
    const value = on(read, spec.state);
    if (value === null) {
      return 'unknown';
    }
    return value ? 'on' : 'off';
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
  const lit = MARKER_LAMPS.map((lamp) => (read.has(lamp.state) ? on(read, lamp.state) : null));
  const lamps = lit.every((value) => value !== null)
    ? (Object.fromEntries(MARKER_LAMPS.map((lamp, i) => [lamp.marker, lit[i]])) as Record<
        Marker,
        boolean
      >)
    : null;

  return {
    status: mics.length === 0 && monitors.length === 0 ? 'waiting' : 'ready',
    transmitting,
    selectionKnown,
    mics,
    monitors,
    lamps,
    notHeard: transmitKey?.listening === 'off' ? transmitting : null,
    missing,
  };
}
