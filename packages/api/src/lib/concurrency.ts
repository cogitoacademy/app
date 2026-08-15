/**
 * Runs an async mapper over items with a bounded concurrency limit.
 *
 * Failures propagate immediately; already-started work is not cancelled but
 * the returned promise rejects with the first error.
 *
 * @param items - the input items
 * @param limit - maximum number of concurrent invocations (>= 1)
 * @param fn - the async mapper
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results = Array.from<R>({ length: items.length });
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeLimit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
