import { expect, test } from "bun:test";
import { createClassEnrollmentRepo } from "../../modules/class-enrollment/class-enrollment.repo";

function connection(
  selectResults: unknown[][] = [],
  updateResults: unknown[][] = [],
) {
  return {
    select: () => {
      const rows = selectResults.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => rows,
        limit: async () => rows,
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    update: () => ({
      set: () => {
        const rows = updateResults.shift() ?? [];
        const query = {
          where: () => query,
          returning: async () => rows,
          // eslint-disable-next-line unicorn/no-thenable -- Drizzle query builders are PromiseLike.
          then: (resolve: (value: unknown[]) => unknown) =>
            Promise.resolve(rows).then(resolve),
        };
        return query;
      },
    }),
  } as never;
}

const now = new Date("2040-01-01T00:00:00.000Z");

function reservedAllocation(overrides: Record<string, unknown> = {}) {
  return {
    id: "allocation-1",
    enrollmentId: "enrollment-1",
    installmentId: "installment-1",
    sessionId: "session-1",
    state: "checkout_reserved",
    rateMarks: 10,
    fundedMarks: 0,
    spentMarks: 0,
    releasedMarks: 0,
    ...overrides,
  };
}

test("stale checkout expiry exits for empty session and enrollment sets", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutsForSessions(connection(), [], now),
  ).resolves.toBe(0);
  await expect(
    repo.expireStaleCheckoutsForSessions(connection([[]]), ["session-1"], now),
  ).resolves.toBe(0);
});

test("stale student checkout skips records that changed before the row lock", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutForStudentClass(
      connection([
        [{ id: "enrollment-1" }],
        [],
        [{ id: "enrollment-1", state: "active", checkoutExpiresAt: now }],
      ]),
      "student-1",
      "class-1",
      now,
    ),
  ).resolves.toBe(1);
});

test("stale student checkout rejects allocations outside checkout-reserved", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutForStudentClass(
      connection([
        [{ id: "enrollment-1" }],
        [],
        [
          {
            id: "enrollment-1",
            state: "checkout_pending",
            checkoutExpiresAt: new Date(now.getTime() - 1),
          },
        ],
        [{ state: "funded" }],
      ]),
      "student-1",
      "class-1",
      now,
    ),
  ).rejects.toThrow("Expired checkout contains a non-checkout seat allocation");
});

test("stale student checkout detects a lost enrollment update", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutForStudentClass(
      connection(
        [
          [{ id: "enrollment-1" }],
          [],
          [
            {
              id: "enrollment-1",
              state: "checkout_pending",
              checkoutExpiresAt: new Date(now.getTime() - 1),
            },
          ],
          [],
        ],
        [[]],
      ),
      "student-1",
      "class-1",
      now,
    ),
  ).rejects.toThrow("Checkout changed before its seat reservations expired");
});

test("stale session checkout rejects allocations outside checkout-reserved", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutsForSessions(
      connection([
        [{ enrollmentId: "enrollment-1" }],
        [
          {
            id: "enrollment-1",
            state: "checkout_pending",
            checkoutExpiresAt: new Date(now.getTime() - 1),
          },
        ],
        [{ state: "funded" }],
      ]),
      ["session-1"],
      now,
    ),
  ).rejects.toThrow("Expired checkout contains a non-checkout seat allocation");
});

test("stale session checkout detects a lost enrollment update", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.expireStaleCheckoutsForSessions(
      connection(
        [
          [{ enrollmentId: "enrollment-1" }],
          [
            {
              id: "enrollment-1",
              state: "checkout_pending",
              checkoutExpiresAt: new Date(now.getTime() - 1),
            },
          ],
          [],
        ],
        [[]],
      ),
      ["session-1"],
      now,
    ),
  ).rejects.toThrow("Checkout changed before its seat reservations expired");
});

test("releaseCheckout rejects funded allocations before releasing seats", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.releaseCheckout(
      connection([[reservedAllocation({ state: "funded" })]]),
      "enrollment-1",
      now,
    ),
  ).rejects.toThrow("Expired checkout contains a non-checkout seat allocation");
});

test("releaseCheckout detects a lost enrollment update", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.releaseCheckout(connection([[]], [[]]), "enrollment-1", now),
  ).rejects.toThrow("Checkout changed before its seat reservations expired");
});

test("releaseCheckout detects an allocation update conflict", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.releaseCheckout(
      connection([[reservedAllocation()]], [[]]),
      "enrollment-1",
      now,
    ),
  ).rejects.toThrow("A class allocation changed before its seat was freed");
});

test("saveCancellation rejects an unpaid allocation that was already funded", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.saveCancellation(
      connection(),
      "student-1",
      {
        enrollmentId: "enrollment-1",
        scope: "withdrawal",
        allocations: [],
        unpaidAllocationIds: ["allocation-1"],
      } as never,
      "request-key",
      [
        reservedAllocation({
          state: "funded",
          fundedMarks: 10,
        }),
      ] as never,
      now,
    ),
  ).rejects.toThrow(
    "A funded allocation must be settled before its seat is freed",
  );
});

test("markInstallmentFunded detects a changed allocation count", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.markInstallmentFunded(
      connection([], [[{ id: "installment-1" }]]),
      "installment-1",
      1,
      now,
    ),
  ).rejects.toThrow("Funded enrollment allocation count changed");
});

test("markInstallmentFunded detects a lost allocation update", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.markInstallmentFunded(
      connection([[reservedAllocation()]], [[{ id: "installment-1" }], []]),
      "installment-1",
      1,
      now,
    ),
  ).rejects.toThrow("Funded enrollment allocation count changed");
});

test("markInstallmentDefaulted rejects an installment without reserved seats", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.markInstallmentDefaulted(
      connection([[]], [[{ id: "installment-1" }]]),
      "installment-1",
      now,
    ),
  ).rejects.toThrow("Unpaid installment must own only unfunded reserved seats");
});

test("markInstallmentDefaulted releases its unfunded seats", async () => {
  const repo = createClassEnrollmentRepo();

  await expect(
    repo.markInstallmentDefaulted(
      connection(
        [[reservedAllocation({ state: "unfunded_reserved" })]],
        [[{ id: "installment-1" }], [{ id: "allocation-1" }]],
      ),
      "installment-1",
      now,
    ),
  ).resolves.toBe(true);
});
