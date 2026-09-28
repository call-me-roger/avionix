import type { ConnectionState } from '@/domain/connection/connection-state';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';
import type { DataRefValue } from '@/domain/simulator/types';

export type SimBadge = 'paused' | 'replay';

export const SIM_BADGE_LABEL: Record<SimBadge, string> = { paused: 'PAUSED', replay: 'REPLAY' };

/**
 * F-11 R3. Replay beats paused: a replay is often paused too, and "replay" is what explains the
 * numbers. Only a live link can say either — a remembered replay flag after a drop is not news.
 */
export function simulatorBadge(
  state: ConnectionState,
  activity: SimulatorActivity,
  inReplay: DataRefValue | undefined,
): SimBadge | null {
  if (state !== 'connected') {
    return null;
  }
  if (typeof inReplay === 'number' && inReplay >= 0.5) {
    return 'replay';
  }
  return activity === 'paused' ? 'paused' : null;
}
