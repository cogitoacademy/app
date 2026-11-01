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
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => rows,
        limit: () => query,
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

test("session checkout expiry rechecks candidates and skips records no longer expired", async () => {
  const repo = createClassEnrollmentRepo();
  expect(
    await repo.expireStaleCheckoutsForSessions(
      connection([
        [{ enrollmentId: "enrollment1" }],
        [{ id: "enrollment1", state: "active", checkoutExpiresAt: now }],
      ]),
      ["session1"],
      now,
    ),
  ).toBe(0);
});

test("lookup results and locks work for existing and missing wallet, installment, and top-up rows", async () => {
  const repo = createClassEnrollmentRepo();
  for (const rows of [[], [{ id: "found" }]]) {
    for (const lock of [undefined, false, true]) {
      expect(
        await repo.getWalletByUser(connection([rows]), "student1", lock),
      ).toEqual(rows[0] ?? null);
      expect(
        await repo.findInstallment(connection([rows]), "enrollment1", 1, lock),
      ).toEqual(rows[0] ?? null);
      expect(
        await repo.findInstallments(connection([rows]), "enrollment1", lock),
      ).toEqual(rows);
      expect(
        await repo.findTopUpAttemptByRequestKey(
          connection([rows]),
          "installment1",
          "request1",
          lock,
        ),
      ).toEqual(rows[0] ?? null);
      expect(
        await repo.findTopUpAttemptForStudent(
          connection([rows]),
          "student1",
          "attempt1",
          lock,
        ),
      ).toEqual(rows[0] ?? null);
    }
  }
  expect(await repo.countBlockingSeats(connection([[]]), "session1")).toBe(0);
  expect(
    await repo.updateTopUpAttempt(
      connection([], [[{ id: "updated" }]]),
      "attempt1",
      { paymentId: "payment1" },
    ),
  ).toEqual({ id: "updated" });
  expect(
    await repo.updateTopUpAttempt(connection([], [[]]), "missing", {
      paymentId: "payment1",
    }),
  ).toBeNull();
});

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

test("lock and lookup helpers return empty or null records without locking", async () => {
  const repo = createClassEnrollmentRepo();
  await expect(repo.lockSessions(connection(), [])).resolves.toEqual([]);
  await expect(
    repo.getClassForEnrollment(connection([[]]), "class-missing"),
  ).resolves.toBeNull();
  await expect(
    repo.getSessionDueInfo(connection([[]]), "session-missing"),
  ).resolves.toBeNull();
  await expect(
    repo.findEnrollmentById(connection([[]]), "enrollment-missing"),
  ).resolves.toBeNull();
});

test("empty enrollment records and availability avoid follow-up allocation queries", async () => {
  const repo = createClassEnrollmentRepo();
  await expect(
    repo.findStudentClassRecords(connection([[]]), "student-1", "class-1"),
  ).resolves.toEqual({ enrollments: [], installments: [], allocations: [] });
  await expect(
    repo.listAvailableSessions(connection([[]]), "class-1", "student-1", now),
  ).resolves.toEqual([]);
});

test("blocking allocation lookup and checkout expiry short circuit empty inputs", async () => {
  const repo = createClassEnrollmentRepo();
  await expect(
    repo.findBlockingAllocationForSessions(connection(), "student-1", []),
  ).resolves.toEqual([]);
  await expect(
    repo.expireStaleCheckoutsForSessions(connection([[]]), ["session-1"], now),
  ).resolves.toBe(0);
});

test("insert helpers accept empty batches without database calls", async () => {
  const repo = createClassEnrollmentRepo();
  const conn = connection();
  await expect(repo.insertInstallments(conn, [])).resolves.toEqual([]);
  await expect(repo.insertAllocations(conn, [])).resolves.toEqual([]);
});

test("funding and activation mutations report stale state conflicts", async () => {
  const repo = createClassEnrollmentRepo();
  await expect(
    repo.markInstallmentFunded(connection([], [[]]), "installment-1", 1, now),
  ).resolves.toBe(false);
  await expect(
    repo.activateEnrollmentFromCheckout(
      connection([], [[]]),
      "enrollment-1",
      now,
    ),
  ).resolves.toBe(false);
  await expect(
    repo.markInstallmentDefaulted(connection([], [[]]), "installment-1", now),
  ).resolves.toBe(false);
});

test("saveCancellation reports a quote allocation missing from locked enrollment data", async () => {
  const repo = createClassEnrollmentRepo();
  await expect(
    repo.saveCancellation(
      connection(),
      "student-1",
      {
        enrollmentId: "enrollment-1",
        scope: "session",
        allocations: [
          { allocationId: "absent", chargeMarks: 0, returnMarks: 10 },
        ],
        unpaidAllocationIds: [],
      } as never,
      "request-key",
      [] as never,
      now,
    ),
  ).rejects.toThrow("Cancellation allocation missing");
});
