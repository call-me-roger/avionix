import type { ConnectionState } from '@/domain/connection/connection-state';

/**
 * What the simulator is doing, independent of the state of the link. Paused, stalled and
 * not-ready are not link states: a paused simulator on a healthy socket and a running
 * simulator behind a dropped socket are both real, so they get their own axis.
 */
export type SimulatorActivity =
  'unknown' | 'running' | 'paused' | 'stalled' | 'pausedOrStalled' | 'noFlight';

export interface ActivityInput {
  linkState: ConnectionState;
  /** The heartbeat DataRef changed value within the staleness threshold. */
  heartbeatAdvancing: boolean;
  /** `sim/time/paused`, or null when that DataRef did not resolve. */
  paused: 0 | 1 | null;
  flightLoaded: boolean;
}

export function deriveActivity(input: ActivityInput): SimulatorActivity {
  if (input.linkState !== 'connected') {
    return 'unknown';
  }
  if (!input.flightLoaded) {
    return 'noFlight';
  }
  if (input.heartbeatAdvancing) {
    return 'running';
  }
  if (input.paused === 1) {
    return 'paused';
  }
  if (input.paused === 0) {
    return 'stalled';
  }
  // `sim/time/paused` is community-sourced and may not exist. Say both rather than guess.
  return 'pausedOrStalled';
}

export const ACTIVITY_LABEL: Record<SimulatorActivity, string> = {
  unknown: 'Simulator state unclear',
  running: 'X-Plane is active',
  paused: 'X-Plane is stopped',
  stalled: 'X-Plane stopped sending data',
  pausedOrStalled: 'X-Plane is paused or not responding',
  noFlight: 'No flight loaded in X-Plane',
};
