import type { SessionSnapshot } from '@/application/session-snapshot';
import { GENERIC_DATAREFS } from '@/domain/aircraft/profiles/generic';
import { type Scheduler, realScheduler } from '@/application/simulator-session';
import type { Store } from '@/application/store';
import { ageMs, isLive } from '@/domain/health/freshness';
import { deriveActivity } from '@/domain/health/simulator-activity';

/**
 * Twice a second: fast enough for F-02 R1's one-second visibility budget, slow enough that a
 * tick costs nothing. The tick exists because staleness is the *absence* of updates, which no
 * event can announce.
 */
export const HEALTH_TICK_MS = 500;

export interface HealthMonitorDeps {
  store: Store<SessionSnapshot>;
  scheduler?: Scheduler;
  now?: () => number;
  tickMs?: number;
}

function readPaused(snapshot: SessionSnapshot): 0 | 1 | null {
  const sample = snapshot.telemetry[GENERIC_DATAREFS.paused];
  if (sample === undefined || typeof sample.value !== 'number') {
    return null;
  }
  return sample.value >= 0.5 ? 1 : 0;
}

export class HealthMonitor {
  private readonly store: Store<SessionSnapshot>;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private readonly tickMs: number;
  private cancel: (() => void) | null = null;
  private running = false;

  constructor(deps: HealthMonitorDeps) {
    this.store = deps.store;
    this.scheduler = deps.scheduler ?? realScheduler;
    this.now = deps.now ?? Date.now;
    this.tickMs = deps.tickMs ?? HEALTH_TICK_MS;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.refresh();
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.cancel !== null) {
      this.cancel();
      this.cancel = null;
    }
  }

  /** Recomputes the derived fields once. Public so tests need no timers. */
  refresh(): void {
    const now = this.now();
    this.store.setState((prev) => {
      const heartbeatAdvancing = isLive(ageMs(prev.health.lastHeartbeatAt, now));
      const activity = deriveActivity({
        linkState: prev.state,
        heartbeatAdvancing,
        paused: readPaused(prev),
        flightLoaded: prev.health.flightLoaded,
      });
      const live = prev.state === 'connected' && heartbeatAdvancing;
      if (activity === prev.health.activity && live === prev.health.live) {
        // Store.setState ignores an identical reference, so this is a genuine no-op and
        // subscribers are not woken twice a second for nothing.
        return prev;
      }
      return { ...prev, health: { ...prev.health, activity, live } };
    });
  }

  private schedule(): void {
    this.cancel = this.scheduler.schedule(() => {
      this.cancel = null;
      if (!this.running) {
        return;
      }
      this.refresh();
      if (!this.running) {
        // A subscriber notified synchronously from refresh() (Store.setState notifies
        // in-line) may have called stop() during this tick. stop() found nothing to
        // cancel above, since we already nulled `cancel` — so re-arming here would leak
        // a timer past stop(). Re-check after refresh(), not only before it.
        return;
      }
      this.schedule();
    }, this.tickMs);
  }
}
