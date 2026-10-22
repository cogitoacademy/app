import { describe, expect, test } from "bun:test";
import { settlementTransaction } from "../../lib/settlement-transaction";
import type { DbType } from "../../lib/db";

describe("settlement transaction retry", () => {
  test("retries the entire transaction after wrapped deadlocks", async () => {
    let attempts = 0;
    let callbacks = 0;
    const db = {
      transaction: async (work: () => Promise<number>) => {
        attempts += 1;
        const result = await work();
        if (attempts < 3) throw { cause: { code: "40P01" } };
        return result;
      },
    } as unknown as DbType;
    const result = await settlementTransaction(db, async () => ++callbacks);
    expect(result).toBe(3);
    expect(attempts).toBe(3);
    expect(callbacks).toBe(3);
  });

  test("never retries domain/unique errors and bounds persistent deadlocks", async () => {
    for (const code of ["23505", "40P01"]) {
      let attempts = 0;
      const error = Object.assign(new Error("transaction failed"), { code });
      const db = {
        transaction: async () => {
          attempts += 1;
          throw error;
        },
      } as unknown as DbType;
      await expect(
        settlementTransaction(db, async () => undefined),
      ).rejects.toBe(error);
      expect(attempts).toBe(code === "40P01" ? 3 : 1);
    }
  });
});
