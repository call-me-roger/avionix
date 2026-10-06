import { useMemo } from 'react';

import { GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import { autothrottleEngaged, modeState } from '@/domain/autopilot/modes';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { usePanel } from '@/features/panels/primitives/PanelContext';

export interface AutopilotTargets {
  /** The selected altitude, ft. */
  altitude: number | null;
  /** The heading bug, degrees magnetic. */
  heading: number | null;
  /** Only while FLC or the autothrottle holds it; otherwise the G1000 hides it as clutter. */
  speed: { value: number; mach: boolean } | null;
  /** Only while VS mode is engaged. */
  verticalSpeed: number | null;
  /** Any autopilot DataRef resolves, so the PFD has an FMA to show. */
  fmaShown: boolean;
}

/** The status, engagement and selector DataRefs of the autopilot features the PFD reads. */
const AUTOPILOT_DATAREFS: readonly string[] = [
  D.autopilotServos,
  D.flightDirectorBars,
  D.autothrottle,
  D.headingBug,
  D.altitudeDial,
  D.verticalSpeedDial,
  D.airspeedDial,
  D.headingStatus,
  D.navStatus,
  D.approachStatus,
  D.altitudeStatus,
  D.verticalSpeedStatus,
  D.speedStatus,
];

/**
 * The autopilot's targets as the PFD and the directional gyro draw them, only ever from X-Plane's
 * own values (U1): none for a missing binding, none with no flight loaded. The speed is memoised so
 * the speed tape, a `React.memo` face, re-renders only when its numbers change.
 */
export function useAutopilotTargets(): AutopilotTargets {
  const { snapshot } = usePanel();
  const missing = (name: string) => snapshot.compatibility.bindings[name]?.status === 'missing';
  const read = (name: string) => (missing(name) ? null : autopilotNumber(snapshot, name));

  const speedHeld =
    modeState(read(D.speedStatus)) === 'engaged' || autothrottleEngaged(read(D.autothrottle));
  const isMach = read(D.airspeedIsMach);
  // Without X-Plane's knots/Mach flag the unit is unknown, and a wrong unit is worse than no box.
  const speedValue = speedHeld && isMach !== null ? read(D.airspeedDial) : null;
  const mach = isMach === 1;
  const speed = useMemo(
    () => (speedValue === null ? null : { value: speedValue, mach }),
    [speedValue, mach],
  );
  const vsEngaged = modeState(read(D.verticalSpeedStatus)) === 'engaged';

  return {
    altitude: read(D.altitudeDial),
    heading: read(D.headingBug),
    speed,
    verticalSpeed: vsEngaged ? read(D.verticalSpeedDial) : null,
    fmaShown: AUTOPILOT_DATAREFS.some((name) => !missing(name)),
  };
}
