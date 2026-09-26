import type { ConnectionState } from '@/domain/connection/connection-state';
import { ageMs, formatAge } from '@/domain/health/freshness';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';

export interface PanelLinkInput {
  state: ConnectionState;
  activity: SimulatorActivity;
  lastHeartbeatAt: number | null;
  now: number;
}

export interface PanelLinkStatus {
  /** Readouts show the simulator's present state; otherwise they are marked not live. */
  valuesCurrent: boolean;
  /** Every control that writes or activates may act. */
  controlsEnabled: boolean;
  /** The one explanation a panel shows at its top (R7), or null when there is nothing to say. */
  notice: string | null;
}

const LIVE: PanelLinkStatus = { valuesCurrent: true, controlsEnabled: true, notice: null };

function notLive(notice: string): PanelLinkStatus {
  return { valuesCurrent: false, controlsEnabled: false, notice };
}

/**
 * R7 as one table. Paused counts as current on purpose: a paused simulator is exactly when pilots
 * set up radios and the autopilot, its values are real (frozen) state, and writes still work.
 */
export function panelLinkStatus(input: PanelLinkInput): PanelLinkStatus {
  const age = ageMs(input.lastHeartbeatAt, input.now);
  switch (input.state) {
    case 'connected':
      return connectedStatus(input.activity, age);
    case 'reconnecting':
      return notLive(
        age === null ? 'Reconnecting.' : `Reconnecting. Showing values from ${formatAge(age)}.`,
      );
    case 'disconnected':
    case 'error':
    case 'connecting':
    case 'pairing':
      return notLive('Not connected. Showing the last known values.');
  }
}

function connectedStatus(activity: SimulatorActivity, age: number | null): PanelLinkStatus {
  switch (activity) {
    case 'running':
    case 'paused':
      return LIVE;
    case 'noFlight':
      return notLive('No flight loaded in X-Plane.');
    case 'stalled':
    case 'pausedOrStalled':
      return notLive(
        age === null
          ? 'X-Plane stopped sending data.'
          : `X-Plane stopped sending data. Last update ${formatAge(age)}.`,
      );
    case 'unknown':
      // The first half-second after a connect, before HealthMonitor's first tick, and an aircraft
      // whose heartbeat did not resolve. Neither is evidence that X-Plane stopped.
      return notLive('Waiting for the first values from X-Plane.');
  }
}
