import { useEffect, useState } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import {
  type BoxState,
  type DisconnectState,
  EMPTY_BOX_STATE,
  EMPTY_DISCONNECT,
  type FmaColumns,
  type FmaSlot,
  disconnectShowing,
  fmaColumns,
  isBoxed,
  nextBoxState,
  nextDisconnect,
} from '@/domain/autopilot/fma';
import { type ModeStatuses, annunciationText } from '@/domain/autopilot/modes';
import { useHaptics } from '@/features/haptics/HapticsProvider';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface Fma {
  columns: FmaColumns;
  /** The slot's active mode is new: drawn boxed for `FMA_BOX_MS`. */
  boxed: (slot: FmaSlot) => boolean;
  /** The autopilot disconnected while values were live, within `AP_DISCONNECT_MS`. */
  disconnected: boolean;
  acknowledge: () => void;
  /** The one-line annunciation, for the accessibility label. */
  text: string;
  /** X-Plane reported any mode value at all; "not live" only qualifies a value. */
  hasValue: boolean;
}

/**
 * The FMA's model from X-Plane's status DataRefs (R2, R5), with the two things only time shows:
 * which mode is new, and an autopilot that just let go. Evaluated during render, which the panel
 * clock drives every second, so no timer of its own; the state follows with React's
 * adjust-while-rendering pattern, as `useReadBack` does.
 */
export function useFma(): Fma {
  const { snapshot, link, now } = usePanel();
  const { failure } = useHaptics();
  const read = (name: string) => autopilotNumber(snapshot, name);
  const statuses: ModeStatuses = {
    hdg: read(D.headingStatus),
    nav: read(D.navStatus),
    apr: read(D.approachStatus),
    alt: read(D.altitudeStatus),
    vs: read(D.verticalSpeedStatus),
    flc: read(D.speedStatus),
    gs: read(D.glideslopeStatus),
    rol: read(D.rollStatus),
    pit: read(D.pitchStatus),
  };
  const autothrottle = read(D.autothrottle);
  const servos = read(D.autopilotServos);
  const ap = servos === null ? null : servos === 1;
  const columns = fmaColumns({
    statuses,
    autothrottle,
    ap: ap === true,
    fd: read(D.flightDirectorBars) === 1,
    vsFpm: read(D.verticalSpeedDial),
    speed: read(D.airspeedDial),
    speedIsMach: read(D.airspeedIsMach) === 1,
  });

  const [boxState, setBoxState] = useState<BoxState>(EMPTY_BOX_STATE);
  const [disconnect, setDisconnect] = useState<DisconnectState>(EMPTY_DISCONNECT);
  // A link loss resets the boxes, so modes seen again on reconnect are not taken as new.
  const nextBox = link.valuesCurrent ? nextBoxState(boxState, columns, now) : EMPTY_BOX_STATE;
  if (nextBox !== boxState) {
    setBoxState(nextBox);
  }
  const nextDisc = nextDisconnect(disconnect, ap, link.valuesCurrent, now);
  if (nextDisc !== disconnect) {
    setDisconnect(nextDisc);
  }

  useEffect(() => {
    if (disconnect.since !== null) {
      failure();
    }
  }, [disconnect.since, failure]);

  return {
    columns,
    boxed: (slot) => isBoxed(boxState, slot, now),
    disconnected: disconnectShowing(disconnect, now),
    acknowledge: () => setDisconnect((current) => ({ ...current, since: null })),
    text: annunciationText(statuses, autothrottle),
    hasValue: autothrottle !== null || Object.values(statuses).some((value) => value !== null),
  };
}
