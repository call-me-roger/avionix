import { HEALTH_TICK_MS, HealthMonitor } from '@/application/health-monitor';
import { OPTIONAL_DATAREFS } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import type { Scheduler } from '@/application/simulator-session';
import { Store } from '@/application/store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';

class FakeScheduler implements Scheduler {
  private queue: Array<{ callback: () => void; delayMs: number }> = [];

  schedule(callback: () => void, delayMs: number): () => void {
    const entry = { callback, delayMs };
    this.queue.push(entry);
    return () => {
      this.queue = this.queue.filter((item) => item !== entry);
    };
  }

  get pending(): number {
    return this.queue.length;
  }

  runNext(): number {
    const entry = this.queue.shift();
    if (entry === undefined) {
      throw new Error('nothing scheduled');
    }
    entry.callback();
    return entry.delayMs;
  }
}

function setup(patch: (snapshot: SessionSnapshot) => SessionSnapshot) {
  const store = new Store(patch(initialSnapshot(GENERIC_PROFILE, 5)));
  const scheduler = new FakeScheduler();
  let clock = 10_000;
  const monitor = new HealthMonitor({
    store,
    scheduler,
    now: () => clock,
    tickMs: HEALTH_TICK_MS,
  });
  return { store, scheduler, monitor, setClock: (value: number) => (clock = value) };
}

const connected = (snapshot: SessionSnapshot, lastHeartbeatAt: number): SessionSnapshot => ({
  ...snapshot,
  state: 'connected',
  health: { ...snapshot.health, flightLoaded: true, lastHeartbeatAt, lastHeartbeatValue: 1 },
});

describe('HealthMonitor', () => {
  it('reports running and live while the heartbeat advances', () => {
    const { store, monitor } = setup((s) => connected(s, 9_900));
    monitor.refresh();
    expect(store.getSnapshot().health).toMatchObject({ activity: 'running', live: true });
  });

  it('goes not live once the heartbeat is older than the threshold', () => {
    const { store, monitor } = setup((s) => connected(s, 5_000));
    monitor.refresh();
    expect(store.getSnapshot().health.live).toBe(false);
  });

  it('reports paused when the paused dataref says so', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 5_000),
      telemetry: { [OPTIONAL_DATAREFS.paused]: { value: 1, receivedAt: 5_000 } },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('paused');
  });

  it('reports stalled when the paused dataref says the sim is not paused', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 5_000),
      telemetry: { [OPTIONAL_DATAREFS.paused]: { value: 0, receivedAt: 5_000 } },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('stalled');
  });

  it('reports the honest combined state when the paused dataref is absent', () => {
    const { store, monitor } = setup((s) => connected(s, 5_000));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('pausedOrStalled');
  });

  it('reports no flight when the session says none is loaded', () => {
    const { store, monitor } = setup((s) => ({
      ...connected(s, 9_900),
      health: { ...connected(s, 9_900).health, flightLoaded: false },
    }));
    monitor.refresh();
    expect(store.getSnapshot().health.activity).toBe('noFlight');
  });

  it('does not notify subscribers when nothing derived changed', () => {
    const { store, monitor } = setup((s) => connected(s, 9_900));
    monitor.refresh();
    const listener = jest.fn();
    store.subscribe(listener);
    monitor.refresh();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reschedules itself on every tick and stops cleanly', () => {
    const { scheduler, monitor } = setup((s) => connected(s, 9_900));
    monitor.start();
    expect(scheduler.pending).toBe(1);
    expect(scheduler.runNext()).toBe(HEALTH_TICK_MS);
    expect(scheduler.pending).toBe(1);
    monitor.stop();
    expect(scheduler.pending).toBe(0);
  });

  it('is safe to start twice', () => {
    const { scheduler, monitor } = setup((s) => connected(s, 9_900));
    monitor.start();
    monitor.start();
    expect(scheduler.pending).toBe(1);
  });

  it('does not leave a timer armed when a subscriber calls stop() from within a tick', () => {
    const { store, scheduler, monitor, setClock } = setup((s) => connected(s, 9_900));
    // Settle the initial state without touching the scheduler.
    monitor.refresh();
    store.subscribe(() => {
      monitor.stop();
    });
    monitor.start();
    expect(scheduler.pending).toBe(1);
    // Go stale so the next tick actually changes activity/live and notifies synchronously.
    setClock(20_000);
    scheduler.runNext();
    expect(scheduler.pending).toBe(0);
  });
});
