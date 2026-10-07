import type { ActivationResult } from '@/domain/panels/activation';
import {
  HOLD_MIN_MS,
  HOLD_RENEW_MS,
  type HoldEnd,
  HoldLease,
  type HoldPhase,
  type HoldTimers,
} from '@/domain/panels/hold-lease';

/** Lets every promise chain started by a fired timer (an awaited async `send`) run to its end. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await Promise.resolve();
  }
}

/** Manual clock: `advance` fires due timers in time order. */
function fakeTimers(): HoldTimers & {
  advance: (ms: number) => Promise<void>;
  pending: () => number;
} {
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback, ms) => {
      nextId += 1;
      timers.set(nextId, { at: now + ms, callback });
      return nextId;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
    pending: () => timers.size,
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) {
          break;
        }
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
        await settle();
      }
      now = end;
    },
  };
}

function setup(results: Partial<Record<HoldPhase, ActivationResult>> = {}, capMs = 10_000) {
  const timers = fakeTimers();
  const sent: HoldPhase[] = [];
  const ends: Array<[HoldEnd, number]> = [];
  const lease = new HoldLease({
    send: async (phase) => {
      sent.push(phase);
      return results[phase] ?? 'ok';
    },
    capMs,
    onEnd: (end, heldMs) => ends.push([end, heldMs]),
    timers,
  });
  return { lease, timers, sent, ends };
}

const flush = settle;

describe('HoldLease (spec §4.3)', () => {
  it('presses, renews every 200 ms while held, and releases at once on let go', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    expect(lease.held).toBe(true);
    await timers.advance(HOLD_RENEW_MS * 3);
    expect(sent).toEqual(['press', 'renew', 'renew', 'renew']);
    lease.release();
    await flush();
    expect(sent.at(-1)).toBe('release');
    expect(ends).toEqual([['released', 600]]);
    expect(lease.held).toBe(false);
    expect(timers.pending()).toBe(0);
  });

  it('holds a tap for the 250 ms minimum before releasing', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    await timers.advance(50);
    lease.release();
    expect(sent).toEqual(['press']);
    await timers.advance(HOLD_MIN_MS);
    expect(sent).toEqual(['press', 'renew', 'release']);
    expect(ends).toEqual([['released', HOLD_MIN_MS]]);
  });

  it('releases even when the finger lifts before the press is answered', async () => {
    const timers = fakeTimers();
    const sent: HoldPhase[] = [];
    let answerPress: (result: ActivationResult) => void = () => undefined;
    const ends: HoldEnd[] = [];
    const lease = new HoldLease({
      send: (phase) => {
        sent.push(phase);
        return phase === 'press'
          ? new Promise<ActivationResult>((resolve) => {
              answerPress = resolve;
            })
          : Promise.resolve('ok');
      },
      capMs: 10_000,
      onEnd: (end) => ends.push(end),
      timers,
    });
    lease.press();
    await timers.advance(HOLD_MIN_MS);
    lease.release();
    expect(sent.at(-1)).toBe('release');
    answerPress('ok');
    await timers.advance(1000);
    expect(sent.filter((phase) => phase === 'renew')).toHaveLength(1);
    expect(ends).toEqual(['released']);
  });

  it('ends at the cap with a release', async () => {
    const { lease, timers, sent, ends } = setup({}, 1000);
    lease.press();
    await timers.advance(1000);
    expect(sent.at(-1)).toBe('release');
    expect(ends).toEqual([['capped', 1000]]);
    expect(lease.held).toBe(false);
    await timers.advance(1000);
    expect(sent.at(-1)).toBe('release');
  });

  it('ends on a failed or refused press or renewal, still sending a release', async () => {
    const failedPress = setup({ press: 'failed' });
    failedPress.lease.press();
    await flush();
    expect(failedPress.ends).toEqual([['failed', 0]]);
    expect(failedPress.sent).toEqual(['press', 'release']);

    const refusedRenew = setup({ renew: 'refused' });
    refusedRenew.lease.press();
    await refusedRenew.timers.advance(HOLD_RENEW_MS);
    expect(refusedRenew.ends).toEqual([['refused', HOLD_RENEW_MS]]);
    expect(refusedRenew.sent).toEqual(['press', 'renew', 'release']);
    await refusedRenew.timers.advance(1000);
    expect(refusedRenew.sent).toHaveLength(3);
  });

  it('cancels at once, without waiting for the minimum', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    await timers.advance(10);
    lease.cancel();
    expect(sent).toEqual(['press', 'release']);
    expect(ends).toEqual([['cancelled', 10]]);
    expect(timers.pending()).toBe(0);
  });

  it('ignores a second press while held and a release or cancel while idle', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.release();
    lease.cancel();
    lease.press();
    lease.press();
    await flush();
    expect(sent).toEqual(['press']);
    lease.release();
    lease.release();
    await timers.advance(HOLD_MIN_MS);
    expect(sent.filter((phase) => phase === 'release')).toHaveLength(1);
    expect(ends).toHaveLength(1);
  });

  it('merges a press inside the minimum-hold tail into the same hold', async () => {
    const { lease, timers, sent, ends } = setup();
    lease.press();
    await timers.advance(50);
    lease.release();
    expect(lease.releasing).toBe(true);
    await timers.advance(100);
    lease.press();
    expect(lease.held).toBe(true);
    expect(lease.releasing).toBe(false);
    await timers.advance(1000);
    expect(sent.filter((phase) => phase === 'press')).toHaveLength(1);
    expect(sent.filter((phase) => phase === 'release')).toHaveLength(0);
    // Renewals every 200 ms from the first press, never interrupted: 1150 ms / 200 ms.
    expect(sent.filter((phase) => phase === 'renew')).toHaveLength(5);
    expect(ends).toEqual([]);
    lease.release();
    await flush();
    expect(sent.filter((phase) => phase === 'release')).toHaveLength(1);
    expect(sent.at(-1)).toBe('release');
    expect(ends).toEqual([['released', 1150]]);
    expect(timers.pending()).toBe(0);
  });

  it('keeps the first cap on a merged hold', async () => {
    const { lease, timers, ends } = setup({}, 1000);
    lease.press();
    await timers.advance(50);
    lease.release();
    await timers.advance(100);
    lease.press();
    await timers.advance(850);
    expect(ends).toEqual([['capped', 1000]]);
  });

  it('treats a send that throws as failed', async () => {
    const timers = fakeTimers();
    const ends: HoldEnd[] = [];
    const lease = new HoldLease({
      send: async (phase) => {
        if (phase === 'press') {
          throw new Error('boom');
        }
        return 'ok';
      },
      capMs: 10_000,
      onEnd: (end) => ends.push(end),
      timers,
    });
    lease.press();
    await flush();
    expect(ends).toEqual(['failed']);
  });
});
