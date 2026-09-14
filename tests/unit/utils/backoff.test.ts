import { DEFAULT_RECONNECT_POLICY, computeBackoffDelayMs } from '@/utils/backoff';

const noJitter = () => 0.5;

describe('computeBackoffDelayMs', () => {
  it('doubles from the base delay: 1s, 2s, 4s, 8s, 16s', () => {
    const delays = [1, 2, 3, 4, 5].map((attempt) =>
      computeBackoffDelayMs(attempt, DEFAULT_RECONNECT_POLICY, noJitter),
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('caps at maxDelayMs', () => {
    expect(computeBackoffDelayMs(10, DEFAULT_RECONNECT_POLICY, noJitter)).toBe(16000);
  });

  it('applies jitter within ±jitterRatio', () => {
    expect(computeBackoffDelayMs(1, DEFAULT_RECONNECT_POLICY, () => 0)).toBe(800);
    expect(computeBackoffDelayMs(1, DEFAULT_RECONNECT_POLICY, () => 1)).toBe(1200);
  });

  it('never returns less than zero and treats attempt < 1 as 1', () => {
    expect(computeBackoffDelayMs(0, DEFAULT_RECONNECT_POLICY, noJitter)).toBe(1000);
  });

  it('exposes the policy limits from the spec', () => {
    expect(DEFAULT_RECONNECT_POLICY.maxAttempts).toBe(5);
    expect(DEFAULT_RECONNECT_POLICY.baseDelayMs).toBe(1000);
    expect(DEFAULT_RECONNECT_POLICY.maxDelayMs).toBe(16000);
    expect(DEFAULT_RECONNECT_POLICY.jitterRatio).toBe(0.2);
  });
});
