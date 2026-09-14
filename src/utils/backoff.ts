export interface ReconnectPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  /** Cap on the exponential schedule before jitter; the actual wait can exceed it by up to jitterRatio. */
  maxDelayMs: number;
  jitterRatio: number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 16000,
  jitterRatio: 0.2,
};

/**
 * Exponential backoff with symmetric jitter. `attempt` is 1-based.
 * `random` returns a number in [0, 1); injectable for deterministic tests.
 */
export function computeBackoffDelayMs(
  attempt: number,
  policy: ReconnectPolicy,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(1, Math.floor(attempt)) - 1;
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.factor ** exponent);
  const jitter = (random() * 2 - 1) * policy.jitterRatio;
  return Math.max(0, Math.round(raw * (1 + jitter)));
}
