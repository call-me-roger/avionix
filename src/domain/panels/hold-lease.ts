import type { ActivationResult } from '@/domain/panels/activation';

/** Seconds X-Plane keeps a held command active after the last renewal (spec §4.3, S4). */
export const HOLD_LEASE_SEC = 0.5;
/** Renewal period: well inside the lease, so one slow frame never lets a held command lapse. */
export const HOLD_RENEW_MS = 200;
/** The shortest hold: a tap, or a screen reader's activation, moves by this much. */
export const HOLD_MIN_MS = 250;
export const TRIM_HOLD_CAP_MS = 10_000;
export const STARTER_HOLD_CAP_MS = 30_000;
/** A hold at least this long that moved nothing is reported (spec §4.3). */
export const RESPONSE_CHECK_MS = 1000;

export type HoldPhase = 'press' | 'renew' | 'release';

/** Why a hold ended: let go, the cap, cancelled by the panel, or a press or renewal not taken. */
export type HoldEnd = 'released' | 'capped' | 'cancelled' | 'failed' | 'refused';

export interface HoldTimers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realHoldTimers: HoldTimers = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface HoldLeaseOptions {
  /** Never expected to reject; a rejection counts as `failed`. */
  send: (phase: HoldPhase) => Promise<ActivationResult>;
  capMs: number;
  onEnd: (end: HoldEnd, heldMs: number) => void;
  timers?: HoldTimers;
}

/**
 * One hold control's lease on a held X-Plane command (R4, R5, S4). `press` sends the command with
 * a 0.5 s lease and renews it every 200 ms; `release` ends it (after HOLD_MIN_MS at the earliest,
 * so a tap is a fixed nudge; a press during that tail merges into the hold); `cancel` ends it now.
 * Every end sends a release, best effort: if the link is gone the lease lapses in X-Plane by itself
 * within 0.5 s, which is the safety this class exists for. A late answer from an earlier hold
 * never touches a later one (`generation`).
 */
export class HoldLease {
  private holding = false;
  private generation = 0;
  private startedAt = 0;
  private renewTimer: unknown = null;
  private capTimer: unknown = null;
  private releaseTimer: unknown = null;
  private readonly timers: HoldTimers;

  constructor(private readonly options: HoldLeaseOptions) {
    this.timers = options.timers ?? realHoldTimers;
  }

  get held(): boolean {
    return this.holding;
  }

  /** Held, with a release waiting out the minimum hold (the tail of a tap). */
  get releasing(): boolean {
    return this.holding && this.releaseTimer !== null;
  }

  /**
   * Starts a hold. A press inside a tap's minimum-hold tail merges into that hold: the pending
   * release is dropped and the hold goes on (same start, same cap, renewals uninterrupted), so a
   * quick re-touch is never swallowed. A press while held otherwise does nothing.
   */
  press(): void {
    if (this.holding) {
      if (this.releaseTimer !== null) {
        this.timers.clearTimeout(this.releaseTimer);
        this.releaseTimer = null;
      }
      return;
    }
    this.holding = true;
    this.generation += 1;
    const generation = this.generation;
    this.startedAt = this.timers.now();
    this.capTimer = this.timers.setTimeout(() => this.finish('capped'), this.options.capMs);
    this.renewTimer = this.timers.setTimeout(() => this.renew(generation), HOLD_RENEW_MS);
    void this.sendFor(generation, 'press');
  }

  release(): void {
    if (!this.holding || this.releaseTimer !== null) {
      return;
    }
    const remaining = HOLD_MIN_MS - (this.timers.now() - this.startedAt);
    if (remaining > 0) {
      this.releaseTimer = this.timers.setTimeout(() => {
        this.releaseTimer = null;
        this.finish('released');
      }, remaining);
      return;
    }
    this.finish('released');
  }

  cancel(): void {
    this.finish('cancelled');
  }

  private renew(generation: number): void {
    if (!this.holding || generation !== this.generation) {
      return;
    }
    this.renewTimer = this.timers.setTimeout(() => this.renew(generation), HOLD_RENEW_MS);
    void this.sendFor(generation, 'renew');
  }

  private async sendFor(generation: number, phase: 'press' | 'renew'): Promise<void> {
    let result: ActivationResult;
    try {
      result = await this.options.send(phase);
    } catch {
      result = 'failed';
    }
    if (result !== 'ok' && this.holding && generation === this.generation) {
      this.finish(result);
    }
  }

  private finish(end: HoldEnd): void {
    if (!this.holding) {
      return;
    }
    this.holding = false;
    for (const timer of [this.renewTimer, this.capTimer, this.releaseTimer]) {
      if (timer !== null) {
        this.timers.clearTimeout(timer);
      }
    }
    this.renewTimer = null;
    this.capTimer = null;
    this.releaseTimer = null;
    const heldMs = this.timers.now() - this.startedAt;
    void this.options.send('release').catch(() => undefined);
    this.options.onEnd(end, heldMs);
  }
}
