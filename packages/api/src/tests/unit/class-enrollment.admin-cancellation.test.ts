import { expect, mock, test } from "bun:test";
import { academyClass } from "@cogito-app/db/schema";
import { createAdminClassCancellation } from "../../modules/class-enrollment/class-enrollment.admin-cancellation";

const classId = "f27dcb3e-e7e4-46d0-8a9d-291a473ff4b2";
const input = {
  classId,
  expectedVersion: 1,
  reason: "Class cannot proceed",
};

function fixture(record: Record<string, unknown> | null) {
  const tx = {
    select: () => {
      let rows: unknown[] = [];
      const query = {
        from: (table: object) => {
          rows = table === academyClass && record ? [record] : [];
          return query;
        },
        where: () => query,
        orderBy: () => query,
        for: () => Promise.resolve(rows),
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
        then: (resolve: (rows: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  };
  return createAdminClassCancellation({
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) => run(tx),
    } as never,
    wallet: { release: mock(async () => undefined) } as never,
    notification: { write: mock(async () => undefined) } as never,
  });
}

test("admin cancellation rejects a missing class", async () => {
  await expect(fixture(null).preview("admin1", input)).rejects.toMatchObject({
    code: "CLASS_ENROLLMENT_NOT_FOUND",
  });
});

test("admin cancellation rejects a class outside published or postponed state", async () => {
  await expect(
    fixture({ id: classId, state: "draft", version: 1 }).preview(
      "admin1",
      input,
    ),
  ).rejects.toMatchObject({
    code: "CLASS_ENROLLMENT_INVALID_OPERATION",
  });
});

test("admin cancellation rejects a stale class version", async () => {
  await expect(
    fixture({ id: classId, state: "published", version: 2 }).preview(
      "admin1",
      input,
    ),
  ).rejects.toMatchObject({
    code: "CLASS_ENROLLMENT_CONFLICT",
  });
});

test("a published class with no enrollments can preview cancellation", async () => {
  await expect(
    fixture({ id: classId, state: "published", version: 1 }).preview(
      "admin1",
      input,
    ),
  ).resolves.toMatchObject({
    classId,
    feeMarks: 0,
    returnMarks: 0,
    retainedMarks: 0,
    cancelledSessionIds: [],
    releasedAllocationIds: [],
  });
});
