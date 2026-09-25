/**
 * Runs `run` over `items` with at most `limit` calls in flight, preserving input order in the
 * result. A profile can declare dozens of names; firing every lookup at once would bury a phone's
 * connection to a PC on the other side of a home router.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await run(item);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
