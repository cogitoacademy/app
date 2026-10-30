import { expect, test } from "bun:test";
import { createReferralService } from "../../modules/referral/referral.service";
import { createReferralHandler } from "../../modules/referral/referral.handler";
import { ReferralError } from "../../modules/referral/referral.errors";

// Scripted query results exercise getMine wiring without opening a database.
function fixture(results: unknown[][]) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: () => {
      const rows = results.shift();
      if (!rows) throw new Error("Unexpected select");
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: async () => rows,
        // Drizzle queries deliberately implement PromiseLike for unbounded selects.
        // eslint-disable-next-line unicorn/no-thenable
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  };
  const service = createReferralService({ db } as unknown as Parameters<
    typeof createReferralService
  >[0]);
  return { service, inserted, results };
}

test("getMine returns legacy code unchanged before querying the candidate namespace", async () => {
  const f = fixture([
    [{ role: "student", name: "Changed Name" }],
    [],
    [],
    [],
    [{ code: "F1234567890ABCDEF" }],
  ]);
  expect((await f.service.getMine("student-id")).code).toBe(
    "F1234567890ABCDEF",
  );
  expect(f.inserted).toEqual([]);
  expect(f.results).toEqual([]);
});

test("getMine uses account name and observes a concurrent owner's winner after conflict", async () => {
  const f = fixture([
    [{ role: "student", name: "Andi" }],
    [],
    [],
    [],
    [],
    [],
    [{ code: "AND007" }],
  ]);
  expect((await f.service.getMine("student-id")).code).toBe("AND007");
  expect(f.inserted).toHaveLength(1);
  expect(f.inserted[0]).toMatchObject({
    kind: "friend",
    referrerUserId: "student-id",
    campaignId: null,
  });
  expect(f.inserted[0]!.code).toMatch(/^AND[0-9]{3}$/);
  expect(f.results).toEqual([]);
});

test("getMine rejects non-students before allocating", async () => {
  const f = fixture([[{ role: "tutor", name: "Andi" }]]);
  await expect(f.service.getMine("tutor-id")).rejects.toMatchObject({
    code: "REFERRAL_STUDENT_ONLY",
  });
  expect(f.inserted).toEqual([]);
});

test("full prefix rereads the owner before reporting exhaustion", async () => {
  const full = Array.from({ length: 1000 }, (_, i) => ({
    code: `AND${String(i).padStart(3, "0")}`,
  }));
  const raced = fixture([
    [{ role: "student", name: "Andi" }],
    [],
    [],
    [],
    [],
    full,
    [{ code: "AND999" }],
  ]);
  expect((await raced.service.getMine("student-id")).code).toBe("AND999");
  expect(raced.inserted).toEqual([]);
  const exhausted = fixture([
    [{ role: "student", name: "Andi" }],
    [],
    [],
    [],
    [],
    full,
    [],
  ]);
  await expect(exhausted.service.getMine("student-id")).rejects.toMatchObject({
    code: "REFERRAL_CODE_EXHAUSTED",
  });
  expect(exhausted.inserted).toEqual([]);
});

test("RPC reports prefix exhaustion as conflict", async () => {
  const handler = createReferralHandler({
    getMine: async () => {
      throw new ReferralError("REFERRAL_CODE_EXHAUSTED", "Contact support.");
    },
  } as unknown as Parameters<typeof createReferralHandler>[0]);
  await expect(
    handler.getMine({
      context: { session: { user: { id: "student-id" } } },
    } as Parameters<typeof handler.getMine>[0]),
  ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
});
