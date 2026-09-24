import { mapWithConcurrency } from '@/utils/concurrency';

describe('mapWithConcurrency', () => {
  it('keeps results in input order', async () => {
    const delays = [30, 10, 20];
    const results = await mapWithConcurrency(delays, 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('never runs more than the limit at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([...Array(20).keys()], 4, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value;
    });
    expect(peak).toBe(4);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (value) => value * 2)).toEqual([2, 4]);
  });

  it('rejects with the first failure instead of hiding it', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) {
          throw new Error('boom');
        }
        return value;
      }),
    ).rejects.toThrow('boom');
  });
});
