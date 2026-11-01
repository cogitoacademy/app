import { expect, mock, test } from "bun:test";
import {
  academyClass,
  academyClassSession,
  academyClassEnrollmentAllocation,
  academyClassEnrollment,
  auditLog,
} from "@cogito-app/db/schema";
import { createAdminClassCancellation } from "../../modules/class-enrollment/class-enrollment.admin-cancellation";

const classId = "f27dcb3e-e7e4-46d0-8a9d-291a473ff4b2";
const input = {
  classId,
  expectedVersion: 1,
  reason: "Class cannot proceed",
};

function fixture(
  record: Record<string, unknown> | null,
  tableRows = new Map<object, unknown[]>(),
) {
  const tx = {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    select: () => {
      let rows: unknown[] = [];
      const query = {
        from: (table: object) => {
          rows =
            tableRows.get(table) ??
            (table === academyClass && record ? [record] : []);
          return query;
        },
        where: () => query,
        orderBy: () => query,
        limit: () => Promise.resolve(rows),
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

test("admin class cancellation replays its receipt and rejects reused keys with changed reason", async () => {
  const record = { id: classId, state: "published", version: 1 };
  const quote = await fixture(record).preview("admin1", input);
  const tableRows = new Map<object, unknown[]>([
    [auditLog, [{ details: { quote, reason: input.reason } }]],
  ]);
  const service = fixture(record, tableRows);
  const confirmation = {
    ...input,
    requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
    quoteVersion: quote.quoteVersion,
  };
  await expect(service.confirm("admin1", confirmation)).resolves.toEqual(quote);
  await expect(
    service.confirm("admin1", { ...confirmation, reason: "Different reason" }),
  ).rejects.toThrow("request key was already used");
});

test("admin class cancellation refuses to release funded Marks without a student wallet", async () => {
  const allocationId = "e66102c3-31bf-4bcc-8461-345695c8c7c0";
  const enrollmentId = "d1e8c16d-9c2e-4a4f-b765-3ebbb9b3892f";
  const tableRows = new Map<object, unknown[]>([
    [
      academyClassSession,
      [{ id: "s1", state: "scheduled", startAt: new Date("2099-01-01") }],
    ],
    [
      academyClassEnrollment,
      [{ id: enrollmentId, studentId: "student1", state: "active" }],
    ],
    [
      academyClassEnrollmentAllocation,
      [
        {
          id: allocationId,
          enrollmentId,
          studentId: "student1",
          sessionId: "s1",
          state: "funded",
          rateMarks: 20,
          fundedMarks: 20,
          spentMarks: 0,
          releasedMarks: 0,
        },
      ],
    ],
  ]);
  const service = fixture(
    { id: classId, state: "published", version: 1 },
    tableRows,
  );
  const quote = await service.preview("admin1", input);
  await expect(
    service.confirm("admin1", {
      ...input,
      requestKey: "66adbbbc-34e2-4b3f-9f56-a48aa14edc04",
      quoteVersion: quote.quoteVersion,
    }),
  ).rejects.toThrow("wallet is unavailable");
});
