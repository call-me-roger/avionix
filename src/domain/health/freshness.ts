/**
 * Subscribed values arrive delta-only at about 10 Hz, so silence from the subscription as a
 * whole means nothing: a parked aircraft produces no traffic. Freshness is therefore keyed to
 * the heartbeat DataRef, which advances every frame the simulator runs.
 *
 * 2000 ms is twenty times the expected 100 ms delivery interval: tolerant of a frame-rate dip
 * or a Wi-Fi hiccup, tight enough that minutes of silent lag cannot pass unreported.
 */
export const STALE_AFTER_MS = 2000;

export function ageMs(lastAt: number | null, now: number): number | null {
  return lastAt === null ? null : Math.max(0, now - lastAt);
}

export function isLive(age: number | null): boolean {
  return age !== null && age <= STALE_AFTER_MS;
}

export function formatAge(age: number | null): string {
  if (age === null) {
    return 'no data yet';
  }
  if (age < 1000) {
    return `${age} ms ago`;
  }
  if (age < 60_000) {
    return `${Math.round(age / 1000)} s ago`;
  }
  return `${Math.round(age / 60_000)} min ago`;
}
