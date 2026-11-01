import { expect, mock, test } from "bun:test";
import type { DbOrTx } from "../../lib/tx";
import { getOperationsAnalytics } from "../../modules/admin/admin-operations-analytics";

test("operations analytics accepts array and pg row-wrapper results and rejects missing aggregates", async () => {
  const row = { privateMarks: 25, privateSessions: 1, earnedIdr: 50000 };
  const query = {
    periodStart: new Date("2040-01-01T00:00:00Z"),
    periodEnd: new Date("2040-02-01T00:00:00Z"),
    activeSince: new Date("2040-01-25T00:00:00Z"),
    previousActiveSince: new Date("2040-01-18T00:00:00Z"),
    now: new Date("2040-02-01T00:00:00Z"),
  } as Parameters<typeof getOperationsAnalytics>[1];
  for (const result of [[row], { rows: [row] }]) {
    const execute = mock(async () => result);
    expect(
      await getOperationsAnalytics({ execute } as unknown as DbOrTx, query),
    ).toEqual(row);
    expect(execute).toHaveBeenCalledTimes(1);
  }
  for (const result of [[], { rows: [] }]) {
    await expect(
      getOperationsAnalytics(
        { execute: async () => result } as unknown as DbOrTx,
        query,
      ),
    ).rejects.toThrow("returned no aggregate row");
  }
});
