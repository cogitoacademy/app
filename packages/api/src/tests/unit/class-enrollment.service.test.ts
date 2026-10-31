import { describe, expect, mock, spyOn, test } from "bun:test";
import * as enrollmentRepoModule from "../../modules/class-enrollment/class-enrollment.repo";
import * as reportReminderRepoModule from "../../modules/class-enrollment/class-enrollment.report-reminders";
import { createClassEnrollmentService } from "../../modules/class-enrollment/class-enrollment.service";

const now = new Date("2040-01-01T00:00:00Z");
const session = {
  id: "session1",
  classId: "class1",
  sequenceNumber: 1,
  state: "scheduled",
  startAt: new Date("2040-01-02T00:00:00Z"),
  capacity: 4,
};
const classRecord = {
  id: "class1",
  state: "published",
  kind: "cohort",
  cohortFullRateMarks: 20,
  cohortHalfRateMarks: 22,
  cohortSingleRateMarks: 25,
  masterclassRateMarks: null,
};
const enrollment = {
  id: "enrollment1",
  classId: "class1",
  plan: "single",
  state: "checkout_pending",
  sessionCount: 1,
  firstRateMarks: 25,
  secondRateMarks: null,
  firstInstallmentMarks: 25,
  secondInstallmentMarks: 0,
  totalMarks: 25,
  checkoutExpiresAt: new Date("2040-01-01T00:15:00Z"),
  createdAt: now,
};

function fixture(
  overrides: Record<string, unknown> = {},
  notification: Record<string, unknown> = {},
  payment: Record<string, unknown> = {},
  wallet: Record<string, unknown> = { hold: mock(async () => undefined) },
  transaction?: unknown,
  clock: (() => Date) | null = () => now,
) {
  let requestReads = 0;
  let recordReads = 0;
  const repo = {
    lockEnrollmentRequestKey: mock(async () => undefined),
    findEnrollmentByRequestKey: mock(async () =>
      ++requestReads === 1 ? null : enrollment,
    ),
    getClassForEnrollment: mock(async () => classRecord),
    expireStaleCheckoutForStudentClass: mock(async () => 0),
    findStudentClassRecords: mock(async () => ({
      enrollments: ++recordReads === 1 ? [] : [enrollment],
      installments: [],
      allocations: [],
    })),
    listClassSessions: mock(async () => [session]),
    lockSessions: mock(async () => [session]),
    findAllocations: mock(async () => [{ sessionId: session.id }]),
    getWalletByUser: mock(async () => ({ availableBalance: 10 })),
    listAvailableSessions: mock(async () => []),
    ...overrides,
  };
  const factory = spyOn(
    enrollmentRepoModule,
    "createClassEnrollmentRepo",
  ).mockReturnValue(
    repo as unknown as ReturnType<
      typeof enrollmentRepoModule.createClassEnrollmentRepo
    >,
  );
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(transaction ?? { execute: async () => undefined }),
  };
  const service = createClassEnrollmentService({
    db,
    wallet,
    payment,
    notification,
    appBaseUrl: "https://example.test",
    clock: clock ?? undefined,
  } as unknown as Parameters<typeof createClassEnrollmentService>[0]);
  return { service, wallet, repo, restore: () => factory.mockRestore() };
}

describe("class enrollment locked request replay", () => {
  test("due jobs count a failed report reminder without losing the scheduler result", async () => {
    const reports = spyOn(
      reportReminderRepoModule,
      "createClassReportReminderRepo",
    ).mockReturnValue({
      findDue: mock(async () => [
        {
          id: "session1",
          tutorId: "tutor1",
          endAt: new Date(now.getTime() - 2 * 24 * 3600000),
        },
      ]),
      writeIfPending: mock(async () => {
        throw new Error("Outbox unavailable");
      }),
    } as any);
    const f = fixture({
      findExpiredCheckouts: mock(async () => []),
      findDueInstallments: mock(async () => []),
      findReminderCandidates: mock(async () => []),
    });
    try {
      expect(await f.service.processDueJobs()).toMatchObject({
        reportRemindersFailed: 1,
        reportRemindersQueued: 0,
      });
    } finally {
      f.restore();
      reports.mockRestore();
    }
  });

  test.each(["active", "checkout_pending"] as const)(
    "enrollment replay preserves %s state when the wallet is unavailable",
    async (state) => {
      const existing = { ...enrollment, state };
      const f = fixture({
        findEnrollmentByRequestKey: mock(async () => existing),
        findStudentClassRecords: mock(async () => ({
          enrollments: [existing],
          installments: [],
          allocations: [],
        })),
        getWalletByUser: mock(async () => null),
      });
      try {
        expect(
          await f.service.createEnrollment("student1", {
            classId: "class1",
            plan: "single",
            sessionId: session.id,
            requestKey: crypto.randomUUID(),
          }),
        ).toMatchObject({
          outcome: "already_exists",
          availableMarks: 0,
          shortfallMarks: state === "active" ? 0 : 25,
        });
        expect(f.wallet.hold).not.toHaveBeenCalled();
      } finally {
        f.restore();
      }
    },
  );
  test("current allocation exposes schedule-change rights and supports the default clock", async () => {
    const notifiedAt = new Date();
    const allocation = {
      enrollmentId: enrollment.id,
      sessionId: session.id,
      state: "funded",
      scheduleChangeSessionState: "scheduled",
      scheduleChangeVersion: 2,
      currentScheduleChangeVersion: 2,
      scheduleChangeNotifiedAt: notifiedAt,
      scheduleChangeExitUntil: new Date(notifiedAt.getTime() + 3600000),
    };
    const f = fixture(
      {
        findStudentClassRecords: mock(async () => ({
          enrollments: [enrollment],
          installments: [],
          allocations: [allocation],
        })),
      },
      {},
      {},
      undefined,
      undefined,
      null,
    );
    try {
      const before = Date.now();
      const result = await f.service.getMyClassEnrollments(
        "student1",
        "class1",
      );
      expect(result.enrollments[0]?.allocations[0]).toMatchObject({
        scheduleChangeVersion: 2,
        scheduleChangeNotifiedAt: notifiedAt,
      });
      const args = f.repo.expireStaleCheckoutForStudentClass.mock
        .calls[0] as unknown as [unknown, string, string, Date];
      expect(args[3].getTime()).toBeGreaterThanOrEqual(before);
      expect(args[3].getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      f.restore();
    }
  });

  test("cancellation rejects an enrollment deleted after initial lookup", async () => {
    let reads = 0;
    const f = fixture({
      findEnrollment: mock(async () => (++reads === 1 ? enrollment : null)),
    });
    try {
      await expect(
        f.service.quoteCancellation("student1", {
          enrollmentId: enrollment.id,
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_NOT_FOUND" });
    } finally {
      f.restore();
    }
  });
  test.each([
    "bad-payment-id",
    "bad-checkout-url",
    "missing-after-provider",
    "different-payment",
    "matching-payment",
  ] as const)(
    "top-up purchase validates provider identity and recovery: %s",
    async (scenario) => {
      let reads = 0;
      const update = mock(async () => undefined);
      const paymentId = scenario === "bad-payment-id" ? 42 : "payment1";
      const checkoutUrl = scenario === "bad-checkout-url" ? 42 : null;
      const f = fixture(
        {
          findTopUpAttemptForStudent: mock(async () => {
            reads++;
            if (scenario === "missing-after-provider" && reads > 1) return null;
            return {
              attempt: {
                id: "attempt1",
                quoteId: "quote1",
                choice: "custom",
                paymentId:
                  reads > 1
                    ? scenario === "different-payment"
                      ? "other-payment"
                      : "payment1"
                    : null,
              },
            };
          }),
          updateTopUpAttempt: update,
        },
        {},
        {
          createPurchaseFromTopUpQuote: mock(async () => ({
            paymentId,
            checkoutUrl,
            status: "pending",
            recoveryRequired: false,
          })),
        },
        { getOrCreate: mock(async () => ({ id: "wallet1" })) },
      );
      try {
        const result = f.service.purchaseTopUp("student1", {
          attemptId: crypto.randomUUID(),
          choice: "custom",
        });
        if (scenario === "matching-payment") {
          expect(await result).toMatchObject({
            paymentId: "payment1",
            checkoutUrl: null,
          });
          expect(update).not.toHaveBeenCalled();
        } else
          await expect(result).rejects.toMatchObject({
            code:
              scenario === "missing-after-provider"
                ? "CLASS_ENROLLMENT_NOT_FOUND"
                : "CLASS_ENROLLMENT_CONFLICT",
          });
      } finally {
        f.restore();
      }
    },
  );

  test.each([
    "missing-after-provider",
    "different-quote",
    "matching-quote",
  ] as const)(
    "top-up quote validates its attempt after the provider call: %s",
    async (scenario) => {
      const attempt = {
        id: "attempt1",
        installmentId: "first",
        requestKey: crypto.randomUUID(),
        requestedMarks: 15,
        choice: null,
        quoteId: "quote1",
      };
      let reads = 0;
      const update = mock(async () => undefined);
      const f = fixture(
        {
          findEnrollment: mock(async () => enrollment),
          findInstallment: mock(async () => ({ id: "first" })),
          findTopUpAttemptByRequestKey: mock(async () => {
            reads++;
            return reads === 1
              ? attempt
              : scenario === "missing-after-provider"
                ? null
                : {
                    ...attempt,
                    quoteId:
                      scenario === "different-quote" ? "other" : "quote1",
                  };
          }),
          updateTopUpAttempt: update,
        },
        {},
        {
          createTopUpQuote: mock(async () => ({
            quoteId: "quote1",
            marks: 15,
          })),
        },
      );
      try {
        const result = f.service.createTopUpQuote("student1", {
          enrollmentId: crypto.randomUUID(),
          ordinal: 1,
          requestKey: attempt.requestKey,
        });
        if (scenario === "matching-quote") {
          expect(await result).toMatchObject({
            quoteId: "quote1",
            requestedMarks: 15,
          });
          expect(update).not.toHaveBeenCalled();
        } else
          await expect(result).rejects.toMatchObject({
            code:
              scenario === "missing-after-provider"
                ? "CLASS_ENROLLMENT_NOT_FOUND"
                : "CLASS_ENROLLMENT_CONFLICT",
          });
      } finally {
        f.restore();
      }
    },
  );
  test.each([
    "missing-initial",
    "missing-locked",
    "null-details",
    "bad-date",
    "bad-output",
    "wrong-hash",
    "wrong-session",
    "wrong-version",
    "matching-replay",
  ] as const)(
    "changed-session confirmation validates saved receipts: %s",
    async (scenario) => {
      const enrollmentId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const saved = {
        enrollmentId,
        sessionId,
        scheduleChangeVersion: 2,
        notifiedAt: new Date(now.getTime() - 1000),
        exitUntil: new Date(now.getTime() + 3600000),
        refundableMarks: 25,
        fundingState: "funded",
        quoteVersion: "f".repeat(64),
      };
      const encoded = {
        ...saved,
        notifiedAt: saved.notifiedAt.toISOString(),
        exitUntil: saved.exitUntil.toISOString(),
        ...(scenario === "bad-date" ? { notifiedAt: "invalid" } : {}),
        ...(scenario === "bad-output" ? { refundableMarks: -1 } : {}),
        ...(scenario === "wrong-hash" ? { quoteVersion: "e".repeat(64) } : {}),
        ...(scenario === "wrong-session"
          ? { sessionId: crypto.randomUUID() }
          : {}),
        ...(scenario === "wrong-version" ? { scheduleChangeVersion: 3 } : {}),
      };
      const selections = [
        [],
        [{ details: scenario === "null-details" ? null : { quote: encoded } }],
      ];
      const query = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => chain,
          for: () => chain,
          // eslint-disable-next-line unicorn/no-thenable -- Model Drizzle query execution.
          then: (resolve: (rows: unknown[]) => unknown) =>
            Promise.resolve(selections.shift() ?? []).then(resolve),
        };
        return chain;
      };
      let reads = 0;
      const f = fixture(
        {
          findEnrollment: mock(async () => {
            reads++;
            return scenario === "missing-initial" ||
              (scenario === "missing-locked" && reads > 1)
              ? null
              : { ...enrollment, id: enrollmentId };
          }),
          findInstallments: mock(async () => []),
        },
        {},
        {},
        {},
        { select: query },
      );
      const input = {
        enrollmentId,
        sessionId,
        scheduleChangeVersion: 2,
        quoteVersion: saved.quoteVersion,
        requestKey: crypto.randomUUID(),
      };
      try {
        if (scenario === "matching-replay")
          expect(
            await f.service.confirmChangedSessionCancellation(
              "student1",
              input,
            ),
          ).toEqual(saved);
        else
          await expect(
            f.service.confirmChangedSessionCancellation("student1", input),
          ).rejects.toMatchObject({
            code: scenario.startsWith("missing")
              ? "CLASS_ENROLLMENT_NOT_FOUND"
              : "CLASS_ENROLLMENT_CONFLICT",
          });
      } finally {
        f.restore();
      }
    },
  );
  test.each([
    "missing-enrollment",
    "missing-session",
    "inactive-enrollment",
    "different-class",
    "different-version",
    "completed-session",
    "not-notified",
    "no-window",
    "future-notification",
    "expired-window",
    "reported",
    "earned",
    "started",
    "missing-seat",
    "newer-seat",
    "released-seat",
    "unfunded-seat",
  ] as const)(
    "changed-session quote revalidates cancellation rights: %s",
    async (scenario) => {
      const row = {
        ...session,
        scheduleChangeVersion: scenario === "different-version" ? 3 : 2,
        classId: scenario === "different-class" ? "other" : session.classId,
        state: scenario === "completed-session" ? "completed" : "scheduled",
        startAt: scenario === "started" ? now : session.startAt,
        scheduleChangeNotifiedAt:
          scenario === "not-notified"
            ? null
            : new Date(
                now.getTime() +
                  (scenario === "future-notification" ? 1000 : -1000),
              ),
        scheduleChangeExitUntil:
          scenario === "no-window"
            ? null
            : new Date(
                now.getTime() +
                  (scenario === "expired-window" ? -1000 : 3600000),
              ),
      };
      const seat = {
        id: "allocation1",
        scheduleChangeVersion: scenario === "newer-seat" ? 3 : 2,
        state: scenario === "released-seat" ? "released" : "unfunded_reserved",
        fundedMarks: 0,
        spentMarks: 0,
        releasedMarks: 0,
        rateMarks: 25,
      };
      const selections = [
        [],
        scenario === "missing-session" ? [] : [row],
        scenario === "reported" ? [{ id: "report1" }] : [],
        scenario === "earned" ? [{ id: "fee1" }] : [],
        scenario === "missing-seat" ? [] : [seat],
      ];
      const query = () => {
        const chain = {
          from: () => chain,
          where: () => chain,
          limit: () => chain,
          for: () => chain,
          // eslint-disable-next-line unicorn/no-thenable -- Model Drizzle awaited results.
          then: (resolve: (value: unknown[]) => unknown) =>
            Promise.resolve(selections.shift() ?? []).then(resolve),
        };
        return chain;
      };
      const f = fixture(
        {
          findEnrollment: mock(async () =>
            scenario === "missing-enrollment"
              ? null
              : {
                  ...enrollment,
                  state:
                    scenario === "inactive-enrollment" ? "cancelled" : "active",
                },
          ),
          findInstallments: mock(async () => []),
        },
        {},
        {},
        {},
        { select: query },
      );
      const input = {
        enrollmentId: enrollment.id,
        sessionId: session.id,
        scheduleChangeVersion: 2,
      };
      try {
        if (scenario === "unfunded-seat") {
          expect(
            await f.service.quoteChangedSessionCancellation("student1", input),
          ).toMatchObject({
            refundableMarks: 0,
            fundingState: "unfunded",
            quoteVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
          });
        } else {
          const code = [
            "missing-enrollment",
            "missing-session",
            "inactive-enrollment",
          ].includes(scenario)
            ? "CLASS_ENROLLMENT_NOT_FOUND"
            : [
                  "reported",
                  "earned",
                  "started",
                  "missing-seat",
                  "newer-seat",
                  "released-seat",
                ].includes(scenario)
              ? "CLASS_ENROLLMENT_INVALID_OPERATION"
              : "CLASS_ENROLLMENT_CONFLICT";
          await expect(
            f.service.quoteChangedSessionCancellation("student1", input),
          ).rejects.toMatchObject({ code });
        }
      } finally {
        f.restore();
      }
    },
  );
  test.each([
    "reprice",
    "empty-installment",
    "no-dates",
    "retained-due",
    "overflow",
    "lost-update",
    "missing-wallet",
    "lost-seat",
    "stale-quote",
    "last-seat",
    "unfunded",
  ] as const)("changed-session confirmation handles %s", async (scenario) => {
    const changedSession = {
      ...session,
      scheduleChangeVersion: 2,
      scheduleChangeNotifiedAt: new Date(now.getTime() - 3600000),
      scheduleChangeExitUntil: new Date(now.getTime() + 3600000),
    };
    const allocation = {
      id: "allocation1",
      sessionId: session.id,
      installmentId: "second",
      state: scenario === "unfunded" ? "unfunded_reserved" : "funded",
      scheduleChangeVersion: 2,
      fundedMarks: scenario === "unfunded" ? 0 : 25,
      rateMarks: 25,
      spentMarks: 0,
      releasedMarks: 0,
      fundingSourceReference: "funding1",
    };
    const remainingDates = [
      { id: "later", startAt: new Date("2040-01-05T00:00:00Z") },
      { id: "earlier", startAt: new Date("2040-01-03T00:00:00Z") },
    ];
    const selects: unknown[][] = [[], [changedSession], [], [], [allocation]];
    const writes: unknown[] = [];
    const selection = () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        for: () => chain,
        // eslint-disable-next-line unicorn/no-thenable -- Drizzle query mock consumes results when awaited.
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(selects.shift() ?? []).then(resolve),
      };
      return chain;
    };
    const tx = {
      execute: async () => undefined,
      select: selection,
      update: () => ({
        set: (values: unknown) => {
          writes.push(values);
          return {
            where: () => ({
              returning: async () =>
                scenario === "lost-update" ? [] : [{ id: allocation.id }],
            }),
          };
        },
      }),
      insert: () => ({
        values: async (values: unknown) => {
          writes.push(values);
        },
      }),
    };
    const release = mock(async () => undefined);
    const f = fixture(
      {
        findEnrollment: mock(async () => ({ ...enrollment, state: "active" })),
        findInstallments: mock(async () => []),
        findAllocations: mock(async () =>
          scenario === "lost-seat" ? [] : [allocation],
        ),
        getWalletByUser: mock(async () =>
          scenario === "missing-wallet" ? null : { id: "wallet1" },
        ),
      },
      { write: mock(async () => undefined) },
      {},
      { release },
      tx,
    );
    const input = {
      enrollmentId: enrollment.id,
      sessionId: session.id,
      scheduleChangeVersion: 2,
    };
    try {
      const quote = await f.service.quoteChangedSessionCancellation(
        "student1",
        input,
      );
      expect(quote.refundableMarks).toBe(scenario === "unfunded" ? 0 : 25);
      selects.push(
        [],
        [],
        [changedSession],
        [],
        [],
        [allocation],
        [
          {
            id: "second",
            state: "pending",
            dueSessionId: scenario === "retained-due" ? "retained" : session.id,
            dueAt: session.startAt,
          },
        ],
        scenario === "empty-installment"
          ? []
          : [
              { sessionId: "later", rateMarks: 20 },
              {
                sessionId: "earlier",
                rateMarks:
                  scenario === "overflow" ? Number.MAX_SAFE_INTEGER : 30,
              },
            ],
      );
      if (scenario !== "empty-installment" && scenario !== "retained-due")
        selects.push(scenario === "no-dates" ? [] : remainingDates);
      selects.push(scenario === "last-seat" ? [] : [{ count: 2 }]);
      const confirmation = f.service.confirmChangedSessionCancellation(
        "student1",
        {
          ...input,
          quoteVersion:
            scenario === "stale-quote" ? "0".repeat(64) : quote.quoteVersion,
          requestKey: crypto.randomUUID(),
        },
      );
      if (
        [
          "overflow",
          "lost-update",
          "missing-wallet",
          "lost-seat",
          "stale-quote",
        ].includes(scenario)
      ) {
        await expect(confirmation).rejects.toMatchObject({
          code: "CLASS_ENROLLMENT_CONFLICT",
        });
        if (["missing-wallet", "lost-seat", "stale-quote"].includes(scenario))
          expect(release).not.toHaveBeenCalled();
        return;
      }
      expect(await confirmation).toEqual(quote);
      if (scenario === "unfunded") expect(release).not.toHaveBeenCalled();
      else
        expect(release).toHaveBeenCalledWith(
          tx,
          expect.objectContaining({
            walletId: "wallet1",
            amount: 25,
            sourceReference: "funding1",
          }),
        );
      if (scenario === "empty-installment")
        expect(writes).toContainEqual(
          expect.objectContaining({ state: "cancelled" }),
        );
      else
        expect(writes).toContainEqual(
          expect.objectContaining({
            sessionCount: 2,
            amountMarks: 50,
            dueSessionId:
              scenario === "no-dates"
                ? null
                : scenario === "retained-due"
                  ? "retained"
                  : "earlier",
            dueAt:
              scenario === "no-dates"
                ? null
                : scenario === "retained-due"
                  ? session.startAt
                  : remainingDates[1]!.startAt,
          }),
        );
      if (scenario === "last-seat")
        expect(writes).toContainEqual(
          expect.objectContaining({ state: "cancelled" }),
        );
      expect(selects).toEqual([]);
    } finally {
      f.restore();
    }
  });
  test.each(["missing", "inactive", "no-expiry", "future", "expired"] as const)(
    "checkout expiry rechecks locked state: %s",
    async (scenario) => {
      const reports = spyOn(
        reportReminderRepoModule,
        "createClassReportReminderRepo",
      ).mockReturnValue({
        findDue: mock(async () => []),
        writeIfPending: mock(async () => false),
      } as any);
      const release = mock(async () => undefined);
      const f = fixture({
        findExpiredCheckouts: mock(async () => [{ id: enrollment.id }]),
        findDueInstallments: mock(async () => []),
        findReminderCandidates: mock(async () => []),
        findEnrollmentById: mock(async () =>
          scenario === "missing"
            ? null
            : {
                ...enrollment,
                state: scenario === "inactive" ? "active" : "checkout_pending",
                checkoutExpiresAt:
                  scenario === "no-expiry"
                    ? null
                    : new Date(
                        now.getTime() + (scenario === "future" ? 1 : -1),
                      ),
              },
        ),
        releaseCheckout: release,
      });
      try {
        expect(await f.service.processDueJobs()).toMatchObject({
          expiredCheckouts: scenario === "expired" ? 1 : 0,
        });
        expect(release).toHaveBeenCalledTimes(scenario === "expired" ? 1 : 0);
      } finally {
        f.restore();
        reports.mockRestore();
      }
    },
  );

  test.each([
    "already-processed",
    "not-due",
    "new-enrollment",
    "send-both",
  ] as const)(
    "installment reminders respect schedule identity and creation time: %s",
    async (scenario) => {
      const reports = spyOn(
        reportReminderRepoModule,
        "createClassReportReminderRepo",
      ).mockReturnValue({
        findDue: mock(async () => []),
        writeIfPending: mock(async () => false),
      } as any);
      const dueAt = new Date(
        now.getTime() +
          (scenario === "not-due"
            ? 8
            : scenario === "new-enrollment"
              ? 0.5
              : 1) *
            24 *
            3600000,
      );
      const write = mock(async () => undefined);
      const mark = mock(async () => undefined);
      const installment = {
        id: "second",
        state: "pending",
        dueSessionId: session.id,
        dueAt,
        amountMarks: 25,
        reminder7dProcessedAt: scenario === "already-processed" ? now : null,
        reminder7dForAt: dueAt,
        reminder1dProcessedAt: scenario === "already-processed" ? now : null,
        reminder1dForAt: dueAt,
      };
      const f = fixture(
        {
          findExpiredCheckouts: mock(async () => []),
          findDueInstallments: mock(async () => []),
          findReminderCandidates: mock(async () => [
            { enrollmentId: enrollment.id, installmentId: "second" },
          ]),
          findEnrollmentById: mock(async () => ({
            ...enrollment,
            state: "active",
            studentId: "student1",
            createdAt: new Date(
              now.getTime() -
                (scenario === "new-enrollment" ? 0 : 10 * 24 * 3600000),
            ),
          })),
          findInstallment: mock(async () => installment),
          lockSessions: mock(async () => [{ ...session, startAt: dueAt }]),
          markReminderProcessed: mark,
        },
        { write },
      );
      try {
        expect(await f.service.processDueJobs()).toMatchObject({
          remindersQueued: scenario === "send-both" ? 2 : 0,
        });
        expect(mark).toHaveBeenCalledTimes(
          scenario === "send-both" || scenario === "new-enrollment" ? 2 : 0,
        );
        expect(write).toHaveBeenCalledTimes(scenario === "send-both" ? 2 : 0);
        if (scenario === "send-both") {
          expect(write.mock.calls).toEqual(
            expect.arrayContaining([
              [
                expect.objectContaining({
                  title: "Class installment due in 7 days",
                  userId: "student1",
                }),
              ],
              [
                expect.objectContaining({
                  title: "Class installment due in 1 day",
                  userId: "student1",
                }),
              ],
            ]),
          );
        }
      } finally {
        f.restore();
        reports.mockRestore();
      }
    },
  );
  test.each([
    "missing-enrollment",
    "inactive",
    "missing-installment",
    "wrong-installment",
    "paid",
    "missing-due-id",
    "missing-session",
    "cancelled-session",
    "future-session",
  ] as const)("due jobs revalidate stale candidates: %s", async (scenario) => {
    const reports = spyOn(
      reportReminderRepoModule,
      "createClassReportReminderRepo",
    ).mockReturnValue({
      findDue: mock(async () => []),
      writeIfPending: mock(async () => false),
    } as any);
    const due = {
      ...session,
      startAt: new Date(now.getTime() + 24 * 3600000),
      state: scenario === "cancelled-session" ? "cancelled" : "scheduled",
    };
    const installment = {
      id: "second",
      state: "pending",
      dueSessionId: session.id,
      dueAt: new Date(0),
    };
    const changed = {
      ...installment,
      ...(scenario === "wrong-installment" ? { id: "other" } : {}),
      ...(scenario === "paid" ? { state: "paid" } : {}),
      ...(scenario === "missing-due-id" ? { dueSessionId: null } : {}),
    };
    const defaulted = mock(async () => true);
    const write = mock(async () => undefined);
    const f = fixture(
      {
        findExpiredCheckouts: mock(async () => []),
        findDueInstallments: mock(async () => [
          { enrollmentId: enrollment.id, installmentId: "second" },
        ]),
        findReminderCandidates: mock(async () => [
          { enrollmentId: enrollment.id, installmentId: "second" },
        ]),
        findEnrollmentById: mock(async () =>
          scenario === "missing-enrollment"
            ? null
            : {
                ...enrollment,
                state: scenario === "inactive" ? "cancelled" : "active",
                studentId: "student1",
                createdAt: now,
              },
        ),
        findInstallment: mock(async () =>
          scenario === "missing-installment" ? null : changed,
        ),
        lockSessions: mock(async () => []),
        getSessionDueInfo: mock(async () =>
          scenario === "missing-session" ? null : due,
        ),
        updateInstallmentDueAt: mock(async () => undefined),
        markInstallmentDefaulted: defaulted,
        markReminderProcessed: mock(async () => undefined),
      },
      { write },
    );
    try {
      expect(await f.service.processDueJobs()).toMatchObject({
        expiredCheckouts: 0,
        defaultedInstallments: 0,
      });
      expect(defaulted).not.toHaveBeenCalled();
      if (scenario !== "future-session") expect(write).not.toHaveBeenCalled();
      else expect(f.repo.updateInstallmentDueAt).toHaveBeenCalledTimes(2);
    } finally {
      f.restore();
      reports.mockRestore();
    }
  });
  test.each([
    "deleted-under-lock",
    "different-plan",
    "different-session",
    "expired",
    "missing-summary",
  ] as const)("an existing request handles %s under lock", async (scenario) => {
    const existing = {
      ...enrollment,
      checkoutExpiresAt:
        scenario === "expired"
          ? new Date(now.getTime() - 1)
          : enrollment.checkoutExpiresAt,
    };
    let reads = 0;
    const releaseCheckout = mock(async () => undefined);
    const f = fixture({
      findEnrollmentByRequestKey: mock(async () =>
        ++reads > 1 && scenario === "deleted-under-lock" ? null : existing,
      ),
      findAllocations: mock(async () => [
        { sessionId: scenario === "different-session" ? "other" : session.id },
      ]),
      findStudentClassRecords: mock(async () => ({
        enrollments: scenario === "missing-summary" ? [] : [existing],
        installments: [],
        allocations: [],
      })),
      releaseCheckout,
    });
    try {
      const result = f.service.createEnrollment("student1", {
        classId: "class1",
        plan: scenario === "different-plan" ? "full" : "single",
        sessionId: session.id,
        requestKey: crypto.randomUUID(),
      });
      if (scenario === "expired") {
        await expect(result).resolves.toMatchObject({
          outcome: "already_exists",
        });
        expect(releaseCheckout).toHaveBeenCalledTimes(1);
      } else {
        await expect(result).rejects.toMatchObject({
          code: scenario.startsWith("different")
            ? "CLASS_ENROLLMENT_CONFLICT"
            : "CLASS_ENROLLMENT_NOT_FOUND",
        });
        expect(releaseCheckout).not.toHaveBeenCalled();
      }
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test.each([
    "inactive-enrollment",
    "missing-due-session",
    "unscheduled-session",
    "passed-deadline",
  ] as const)("second-installment top-up rejects %s", async (scenario) => {
    const f = fixture({
      findEnrollment: mock(async () => ({
        ...enrollment,
        state: scenario === "inactive-enrollment" ? "expired" : "active",
      })),
      findInstallment: mock(async () => ({
        id: "second",
        state: "pending",
        amountMarks: 25,
        dueSessionId: scenario === "missing-due-session" ? null : session.id,
      })),
      findTopUpAttemptByRequestKey: mock(async () => null),
      getSessionDueInfo: mock(async () =>
        scenario === "unscheduled-session"
          ? { ...session, state: "cancelled" }
          : scenario === "passed-deadline"
            ? { ...session, startAt: new Date(now.getTime() - 1) }
            : session,
      ),
    });
    try {
      await expect(
        f.service.createTopUpQuote("student1", {
          enrollmentId: crypto.randomUUID(),
          ordinal: 2,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test.each(["missing", "draft", "unsupported-kind"] as const)(
    "new enrollment rejects an unavailable class: %s",
    async (scenario) => {
      const f = fixture({
        getClassForEnrollment: mock(async () =>
          scenario === "missing"
            ? null
            : {
                ...classRecord,
                state: scenario === "draft" ? "draft" : "published",
                kind: scenario === "unsupported-kind" ? "private" : "cohort",
              },
        ),
      });
      try {
        await expect(
          f.service.createEnrollment("student1", {
            classId: "class1",
            plan: "single",
            sessionId: session.id,
            requestKey: crypto.randomUUID(),
          }),
        ).rejects.toMatchObject({
          code:
            scenario === "unsupported-kind"
              ? "CLASS_ENROLLMENT_INVALID_OPERATION"
              : "CLASS_ENROLLMENT_NOT_FOUND",
        });
        expect(f.repo.lockSessions).not.toHaveBeenCalled();
        expect(f.wallet.hold).not.toHaveBeenCalled();
      } finally {
        f.restore();
      }
    },
  );

  test("a defaulted half enrollment requires a fresh half-plan quote", async () => {
    const previous = { ...enrollment, plan: "half", state: "active" };
    const f = fixture({
      findStudentClassRecords: mock(async () => ({
        enrollments: [previous],
        installments: [
          {
            enrollmentId: previous.id,
            ordinal: 2,
            state: "defaulted",
          },
        ],
        allocations: [],
      })),
    });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.repo.lockSessions).not.toHaveBeenCalled();
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("maps an invalid plan quote to an enrollment operation error", async () => {
    const f = fixture({
      findEnrollmentByRequestKey: mock(async () => null),
      findStudentClassRecords: mock(async () => ({
        enrollments: [],
        installments: [],
        allocations: [],
      })),
    });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "masterclass",
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_INVALID_OPERATION" });
    } finally {
      f.restore();
    }
  });

  test("rethrows unexpected errors from enrollment quote calculation", async () => {
    const f = fixture({
      findEnrollmentByRequestKey: mock(async () => null),
      findStudentClassRecords: mock(async () => ({
        enrollments: [],
        installments: [],
        allocations: [],
      })),
      listClassSessions: mock(async () => [
        session,
        { ...session, id: "malformed", startAt: "not-a-date" as any },
      ]),
    });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toThrow("getTime");
    } finally {
      f.restore();
    }
  });

  test("rejects a selected session already blocked by another enrollment", async () => {
    const f = fixture({
      findEnrollmentByRequestKey: mock(async () => null),
      findStudentClassRecords: mock(async () => ({
        enrollments: [],
        installments: [],
        allocations: [],
      })),
      expireStaleCheckoutsForSessions: mock(async () => undefined),
      findBlockingAllocationForSessions: mock(async () => [
        { sessionId: session.id },
      ]),
    });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test.each(["cancelled", "completed", "draft"] as const)(
    "non-enrolling %s classes expose only existing student history",
    async (state) => {
      for (const owned of [true, false]) {
        const f = fixture({
          getClassForEnrollment: mock(async () => ({ ...classRecord, state })),
          findStudentClassRecords: mock(async () => ({
            enrollments: owned ? [enrollment] : [],
            installments: [],
            allocations: [],
          })),
        });
        try {
          const result = f.service.getMyClassEnrollments("student1", "class1");
          if (owned)
            await expect(result).resolves.toMatchObject({
              classState: state,
              eligibleSessions: [],
              enrollments: [{ id: enrollment.id }],
            });
          else
            await expect(result).rejects.toMatchObject({
              code: "CLASS_ENROLLMENT_NOT_FOUND",
            });
          expect(
            f.repo.expireStaleCheckoutForStudentClass,
          ).not.toHaveBeenCalled();
          expect(f.repo.listAvailableSessions).not.toHaveBeenCalled();
        } finally {
          f.restore();
        }
      }
    },
  );

  test.each([
    "pending",
    "active",
    "missing-wallet",
    "different-class",
    "different-session",
    "missing-summary",
  ] as const)(
    "an enrollment discovered after the session lock handles %s",
    async (scenario) => {
      const retry = {
        ...enrollment,
        classId:
          scenario === "different-class" ? "other-class" : enrollment.classId,
        state: scenario === "active" ? "active" : enrollment.state,
      };
      let requestReads = 0;
      let recordReads = 0;
      const f = fixture({
        findEnrollmentByRequestKey: mock(async () =>
          ++requestReads === 1 ? null : retry,
        ),
        findAllocations: mock(async () => [
          {
            sessionId:
              scenario === "different-session" ? "other-session" : session.id,
          },
        ]),
        findStudentClassRecords: mock(async () => ({
          enrollments:
            ++recordReads === 1 || scenario === "missing-summary"
              ? []
              : [retry],
          installments: [],
          allocations: [],
        })),
        getWalletByUser: mock(async () =>
          scenario === "missing-wallet" ? null : { availableBalance: 10 },
        ),
      });
      try {
        const pending = f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        });
        if (scenario.startsWith("different"))
          await expect(pending).rejects.toMatchObject({
            code: "CLASS_ENROLLMENT_CONFLICT",
          });
        else if (scenario === "missing-summary")
          await expect(pending).rejects.toMatchObject({
            code: "CLASS_ENROLLMENT_NOT_FOUND",
          });
        else
          await expect(pending).resolves.toMatchObject({
            id: enrollment.id,
            outcome: "already_exists",
            availableMarks: scenario === "missing-wallet" ? 0 : 10,
            shortfallMarks:
              scenario === "active"
                ? 0
                : scenario === "missing-wallet"
                  ? 25
                  : 15,
          });
        expect(f.wallet.hold).not.toHaveBeenCalled();
      } finally {
        f.restore();
      }
    },
  );

  test("a changed locked schedule rejects the quote before any wallet hold", async () => {
    const f = fixture({
      lockSessions: mock(async () => [{ ...session, state: "cancelled" }]),
    });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("postponed classes show owned enrollment history without offering new sessions", async () => {
    const f = fixture({
      getClassForEnrollment: mock(async () => ({
        ...classRecord,
        state: "postponed",
      })),
      findStudentClassRecords: mock(async () => ({
        enrollments: [enrollment],
        installments: [],
        allocations: [],
      })),
    });
    try {
      await expect(
        f.service.getMyClassEnrollments("student1", "class1"),
      ).resolves.toMatchObject({
        classState: "postponed",
        eligibleSessions: [],
        enrollments: [{ id: enrollment.id }],
      });
      expect(f.repo.listAvailableSessions).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("top-up purchase stores the selected option and payment identity", async () => {
    const attemptId = crypto.randomUUID();
    let reads = 0;
    const updateTopUpAttempt = mock(async () => undefined);
    const createPurchaseFromTopUpQuote = mock(async () => ({
      paymentId: "payment-1",
      checkoutUrl: "https://pay.example/checkout",
      status: "pending",
      recoveryRequired: false,
    }));
    const f = fixture(
      {
        findTopUpAttemptForStudent: mock(async () => {
          reads += 1;
          return {
            attempt: {
              id: attemptId,
              quoteId: "quote-1",
              choice: null,
              paymentId: null,
            },
          };
        }),
        updateTopUpAttempt,
      },
      {},
      { createPurchaseFromTopUpQuote },
      {
        hold: mock(async () => undefined),
        getOrCreate: mock(async () => ({ id: "wallet-1" })),
      },
    );
    try {
      await expect(
        f.service.purchaseTopUp("student1", {
          attemptId,
          choice: "recommended",
        }),
      ).resolves.toMatchObject({
        attemptId,
        paymentId: "payment-1",
        checkoutUrl: "https://pay.example/checkout",
        status: "pending",
        recoveryRequired: false,
      });
      expect(reads).toBe(2);
      expect(createPurchaseFromTopUpQuote).toHaveBeenCalledWith(
        "student1",
        "wallet-1",
        "quote-1",
        "recommended",
      );
      expect(updateTopUpAttempt).toHaveBeenCalledTimes(2);
    } finally {
      f.restore();
    }
  });
});

describe("class enrollment checkout recovery", () => {
  test.each(["funded", "defaulted", "cancelled"] as const)(
    "second installment reports %s without a wallet",
    async (state) => {
      const second = { id: "second", ordinal: 2, state, amountMarks: 25 };
      const f = fixture({
        findEnrollment: mock(async () => ({ ...enrollment, state: "active" })),
        findAllocations: mock(async () => []),
        lockSessions: mock(async () => []),
        findInstallment: mock(async () => second),
        findInstallments: mock(async () => [second]),
        getWalletByUser: mock(async () => null),
      });
      try {
        expect(
          await f.service.paySecondInstallment("student1", enrollment.id),
        ).toMatchObject({
          outcome: state === "cancelled" ? "expired" : state,
          availableMarks: 0,
        });
        expect(f.wallet.hold).not.toHaveBeenCalled();
      } finally {
        f.restore();
      }
    },
  );

  test("already-active checkout reports zero available Marks when its wallet is missing", async () => {
    const f = fixture({
      findEnrollment: mock(async () => ({ ...enrollment, state: "active" })),
      findAllocations: mock(async () => []),
      lockSessions: mock(async () => []),
      findInstallments: mock(async () => [{ id: "first", ordinal: 1 }]),
      getWalletByUser: mock(async () => null),
    });
    try {
      expect(
        await f.service.completeCheckout("student1", enrollment.id),
      ).toMatchObject({ outcome: "funded", availableMarks: 0 });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test.each([
    "no-due-session",
    "missing-due-session",
    "missing-due-time",
    "defaulted-without-wallet",
    "insufficient-without-wallet",
  ] as const)("second installment handles %s", async (scenario) => {
    const dueSession = {
      ...session,
      startAt:
        scenario === "defaulted-without-wallet"
          ? new Date(now.getTime() - 1000)
          : session.startAt,
    };
    const second = {
      id: "second",
      ordinal: 2,
      state: "pending",
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      dueSessionId: scenario === "no-due-session" ? null : session.id,
      dueAt: scenario === "missing-due-time" ? null : dueSession.startAt,
    };
    const f = fixture({
      findEnrollment: mock(async () => ({ ...enrollment, state: "active" })),
      findAllocations: mock(async () => [
        {
          installmentId: second.id,
          sessionId: session.id,
          state: "unfunded_reserved",
          rateMarks: 25,
        },
      ]),
      lockSessions: mock(async () => []),
      findInstallment: mock(async () => second),
      findInstallments: mock(async () => [second]),
      getSessionDueInfo: mock(async () =>
        scenario === "missing-due-session" ? null : dueSession,
      ),
      updateInstallmentDueAt: mock(async () => undefined),
      markInstallmentDefaulted: mock(async () => true),
      getWalletByUser: mock(async () => {
        return scenario === "missing-due-time"
          ? { id: "wallet1", availableBalance: 0 }
          : null;
      }),
    });
    try {
      const result = f.service.paySecondInstallment("student1", enrollment.id);
      if (["no-due-session", "missing-due-session"].includes(scenario))
        await expect(result).rejects.toMatchObject({
          code: "CLASS_ENROLLMENT_CONFLICT",
        });
      else
        expect(await result).toMatchObject({
          outcome:
            scenario === "defaulted-without-wallet"
              ? "defaulted"
              : "insufficient",
          availableMarks: 0,
        });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });
  test("student enrollment lookup rejects a deleted class", async () => {
    const f = fixture({ getClassForEnrollment: mock(async () => null) });
    try {
      await expect(
        f.service.getMyClassEnrollments("student1", "missing"),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_NOT_FOUND" });
    } finally {
      f.restore();
    }
  });

  test.each(["missing-initial", "missing-locked", "funding-race"] as const)(
    "second installment rejects %s",
    async (scenario) => {
      let reads = 0;
      const installment = {
        id: "second",
        ordinal: 2,
        state: "pending",
        rateMarks: 25,
        sessionCount: 1,
        amountMarks: 25,
        dueSessionId: session.id,
        dueAt: session.startAt,
      };
      const allocation = {
        installmentId: installment.id,
        sessionId: session.id,
        state: "unfunded_reserved",
        rateMarks: 25,
        fundedMarks: 0,
        spentMarks: 0,
        releasedMarks: 0,
      };
      const f = fixture({
        findEnrollment: mock(async () => {
          reads++;
          return scenario === "missing-initial" ||
            (scenario === "missing-locked" && reads > 1)
            ? null
            : { ...enrollment, state: "active" };
        }),
        findInstallment: mock(async () => installment),
        findAllocations: mock(async () => [allocation]),
        getWalletByUser: mock(async () => ({
          id: "wallet1",
          availableBalance: 25,
        })),
        markInstallmentFunded: mock(async () => false),
      });
      try {
        await expect(
          f.service.paySecondInstallment("student1", enrollment.id),
        ).rejects.toMatchObject({
          code:
            scenario === "funding-race"
              ? "CLASS_ENROLLMENT_CONFLICT"
              : "CLASS_ENROLLMENT_NOT_FOUND",
        });
        expect(f.wallet.hold).toHaveBeenCalledTimes(
          scenario === "funding-race" ? 1 : 0,
        );
      } finally {
        f.restore();
      }
    },
  );
  test.each([
    "missing-initial",
    "missing-locked",
    "missing-first",
    "expired-reread",
    "funding-race",
    "activation-race",
    "funded-reread",
    "missing-session",
    "started-session",
    "missing-class",
  ] as const)(
    "checkout confirmation rejects stale locked state: %s",
    async (scenario) => {
      const first = {
        id: "first",
        ordinal: 1,
        rateMarks: 25,
        sessionCount: 1,
        amountMarks: 25,
        state: "checkout_pending",
      };
      const allocation = {
        installmentId: first.id,
        sessionId: session.id,
        state: "checkout_reserved",
        rateMarks: 25,
        fundedMarks: 0,
        spentMarks: 0,
        releasedMarks: 0,
        fundingEventKey: "event1",
        fundingSourceReference: "source1",
      };
      let reads = 0;
      const f = fixture({
        findEnrollment: mock(async () => {
          reads++;
          if (
            scenario === "missing-initial" ||
            (scenario === "missing-locked" && reads > 1) ||
            (["expired-reread", "funded-reread"].includes(scenario) &&
              reads > 2)
          )
            return null;
          return {
            ...enrollment,
            checkoutExpiresAt: new Date(
              now.getTime() + (scenario === "expired-reread" ? -1000 : 60000),
            ),
          };
        }),
        findInstallments: mock(async () =>
          scenario === "missing-first" ? [] : [first],
        ),
        findAllocations: mock(async () => [allocation]),
        lockSessions: mock(async () =>
          scenario === "missing-session"
            ? []
            : [
                {
                  ...session,
                  startAt:
                    scenario === "started-session" ? now : session.startAt,
                },
              ],
        ),
        getClassForEnrollment: mock(async () =>
          scenario === "missing-class" ? null : classRecord,
        ),
        getWalletByUser: mock(async () => ({
          id: "wallet1",
          availableBalance: 25,
        })),
        releaseCheckout: mock(async () => undefined),
        markInstallmentFunded: mock(async () => scenario !== "funding-race"),
        markUnfundedInstallmentsReserved: mock(async () => undefined),
        activateEnrollmentFromCheckout: mock(
          async () => scenario !== "activation-race",
        ),
      });
      try {
        await expect(
          f.service.completeCheckout("student1", enrollment.id),
        ).rejects.toMatchObject({
          code: [
            "missing-initial",
            "missing-locked",
            "missing-first",
            "expired-reread",
            "funded-reread",
          ].includes(scenario)
            ? "CLASS_ENROLLMENT_NOT_FOUND"
            : "CLASS_ENROLLMENT_CONFLICT",
        });
        expect(f.wallet.hold).toHaveBeenCalledTimes(
          ["funding-race", "activation-race", "funded-reread"].includes(
            scenario,
          )
            ? 1
            : 0,
        );
      } finally {
        f.restore();
      }
    },
  );
  function createFundingFixture(
    options: {
      allocationState?: string;
      allocationRateMarks?: number;
      markedFunded?: boolean;
      activated?: boolean;
    } = {},
  ) {
    let firstInstallmentId = "";
    return fixture({
      findEnrollmentByRequestKey: mock(async () => null),
      findStudentClassRecords: mock(async () => ({
        enrollments: [],
        installments: [],
        allocations: [],
      })),
      expireStaleCheckoutsForSessions: mock(async () => undefined),
      findBlockingAllocationForSessions: mock(async () => []),
      countBlockingSeats: mock(async () => 0),
      insertEnrollment: mock(async () => undefined),
      insertInstallments: mock(async (_tx: unknown, rows: any[]) => {
        firstInstallmentId = rows[0].id;
      }),
      insertAllocations: mock(async () => undefined),
      findAllocations: mock(async () => [
        {
          installmentId: firstInstallmentId,
          sessionId: session.id,
          state: options.allocationState ?? "checkout_reserved",
          rateMarks: options.allocationRateMarks ?? 25,
          fundingEventKey: "funding-event",
          fundingSourceReference: "funding-source",
        },
      ]),
      getWalletByUser: mock(async () => ({
        id: "wallet1",
        availableBalance: 25,
      })),
      markInstallmentFunded: mock(async () => options.markedFunded ?? true),
      markUnfundedInstallmentsReserved: mock(async () => undefined),
      activateEnrollmentFromCheckout: mock(
        async () => options.activated ?? true,
      ),
    });
  }

  test("creation reserves checkout without moving Marks when no wallet exists", async () => {
    const f = createFundingFixture();
    let created: unknown;
    (f.repo.getWalletByUser as any).mockResolvedValue(null);
    (f.repo.insertEnrollment as any).mockImplementation(
      async (_tx: unknown, values: unknown) => {
        created = values;
      },
    );
    (f.repo.findStudentClassRecords as any).mockImplementation(async () => ({
      enrollments: created ? [created] : [],
      installments: [],
      allocations: [],
    }));
    try {
      expect(
        await f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).toMatchObject({
        outcome: "checkout_pending",
        availableMarks: 0,
        shortfallMarks: 25,
      });
      expect(f.wallet.hold).not.toHaveBeenCalled();
      expect(f.repo.activateEnrollmentFromCheckout).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("creation rejects an enrollment missing from the final student state", async () => {
    const f = createFundingFixture();
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_NOT_FOUND" });
      expect(f.wallet.hold).toHaveBeenCalledTimes(1);
    } finally {
      f.restore();
    }
  });

  test("rejects first-installment reservations whose amount changed", async () => {
    const f = createFundingFixture({ allocationRateMarks: 24 });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("rejects first-installment reservations that changed state", async () => {
    const f = createFundingFixture({ allocationState: "funded" });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("rejects a first-installment funding race", async () => {
    const f = createFundingFixture({ markedFunded: false });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).toHaveBeenCalledTimes(1);
    } finally {
      f.restore();
    }
  });

  test("rejects activation after the first installment has been funded", async () => {
    const f = createFundingFixture({ activated: false });
    try {
      await expect(
        f.service.createEnrollment("student1", {
          classId: "class1",
          plan: "single",
          sessionId: session.id,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(f.wallet.hold).toHaveBeenCalledTimes(1);
    } finally {
      f.restore();
    }
  });

  test("completeCheckout returns an already-active enrollment as funded", async () => {
    const active = { ...enrollment, state: "active" };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => []),
      lockSessions: mock(async () => []),
      findInstallments: mock(async () => [
        {
          id: "first",
          ordinal: 1,
          rateMarks: 25,
          amountMarks: 25,
          sessionCount: 1,
        },
      ]),
      getWalletByUser: mock(async () => ({ availableBalance: 9 })),
    });
    try {
      await expect(
        f.service.completeCheckout("student1", enrollment.id),
      ).resolves.toMatchObject({
        outcome: "funded",
        availableMarks: 9,
        shortfallMarks: 0,
      });
    } finally {
      f.restore();
    }
  });

  test("completeCheckout reports a non-pending enrollment as expired", async () => {
    const cancelled = { ...enrollment, state: "cancelled" };
    const f = fixture({
      findEnrollment: mock(async () => cancelled),
      findAllocations: mock(async () => []),
      lockSessions: mock(async () => []),
      findInstallments: mock(async () => [
        {
          id: "first",
          ordinal: 1,
          rateMarks: 25,
          amountMarks: 25,
          sessionCount: 1,
        },
      ]),
    });
    try {
      await expect(
        f.service.completeCheckout("student1", enrollment.id),
      ).resolves.toMatchObject({ outcome: "expired" });
    } finally {
      f.restore();
    }
  });

  test("completeCheckout refuses a class that stopped accepting checkout", async () => {
    const pending = {
      ...enrollment,
      state: "checkout_pending",
      checkoutExpiresAt: new Date(now.getTime() + 60_000),
    };
    const f = fixture({
      findEnrollment: mock(async () => pending),
      findAllocations: mock(async () => []),
      lockSessions: mock(async () => []),
      findInstallments: mock(async () => [
        {
          id: "first",
          ordinal: 1,
          rateMarks: 25,
          amountMarks: 25,
          sessionCount: 1,
        },
      ]),
      getClassForEnrollment: mock(async () => ({
        ...classRecord,
        state: "cancelled",
      })),
    });
    try {
      await expect(
        f.service.completeCheckout("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test("paySecondInstallment rejects an enrollment without installment two", async () => {
    const active = { ...enrollment, state: "active" };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => []),
      lockSessions: mock(async () => []),
      findInstallment: mock(async () => undefined),
    });
    try {
      await expect(
        f.service.paySecondInstallment("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_INVALID_OPERATION" });
    } finally {
      f.restore();
    }
  });

  test("paySecondInstallment rejects a due session that is no longer scheduled", async () => {
    const active = { ...enrollment, state: "active" };
    const second = {
      id: "second",
      enrollmentId: enrollment.id,
      ordinal: 2,
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      state: "pending",
      dueSessionId: session.id,
      dueAt: session.startAt,
    };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => [
        { sessionId: session.id, state: "unfunded_reserved" },
      ]),
      lockSessions: mock(async () => [{ ...session, state: "cancelled" }]),
      findInstallment: mock(async () => second),
    });
    try {
      await expect(
        f.service.paySecondInstallment("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test("paySecondInstallment returns an insufficient-balance summary", async () => {
    const active = { ...enrollment, state: "active" };
    const second = {
      id: "second",
      enrollmentId: enrollment.id,
      ordinal: 2,
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      state: "pending",
      dueSessionId: session.id,
      dueAt: session.startAt,
    };
    const allocation = {
      installmentId: second.id,
      sessionId: session.id,
      state: "unfunded_reserved",
      rateMarks: 25,
      ordinal: 1,
      sequenceNumber: 2,
      fundedMarks: 0,
      spentMarks: 0,
      releasedMarks: 0,
    };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => [allocation]),
      lockSessions: mock(async () => [session]),
      findInstallment: mock(async () => second),
      getWalletByUser: mock(
        async (_tx: unknown, _studentId: string, locked: boolean) =>
          locked ? null : { availableBalance: 10 },
      ),
      findInstallments: mock(async () => [second]),
    });
    try {
      await expect(
        f.service.paySecondInstallment("student1", enrollment.id),
      ).resolves.toMatchObject({
        outcome: "insufficient",
        availableMarks: 0,
        shortfallMarks: 25,
      });
    } finally {
      f.restore();
    }
  });

  test.each([null, 10])(
    "completeCheckout returns an insufficient-balance summary for wallet balance %s",
    async (balance) => {
      const pending = {
        ...enrollment,
        state: "checkout_pending",
        checkoutExpiresAt: new Date(now.getTime() + 60_000),
      };
      const first = {
        id: "first",
        enrollmentId: enrollment.id,
        ordinal: 1,
        rateMarks: 25,
        sessionCount: 1,
        amountMarks: 25,
        state: "checkout_pending",
      };
      const allocation = {
        installmentId: first.id,
        sessionId: session.id,
        state: "checkout_reserved",
        rateMarks: 25,
        ordinal: 1,
        sequenceNumber: 1,
        fundedMarks: 0,
        spentMarks: 0,
        releasedMarks: 0,
      };
      const f = fixture({
        findEnrollment: mock(async () => pending),
        findAllocations: mock(async () => [
          allocation,
          { ...allocation, sessionId: "released-session", state: "released" },
        ]),
        lockSessions: mock(async () => [session]),
        findInstallments: mock(async () => [first]),
        getWalletByUser: mock(async () =>
          balance === null ? null : { availableBalance: balance },
        ),
      });
      try {
        await expect(
          f.service.completeCheckout("student1", enrollment.id),
        ).resolves.toMatchObject({
          outcome: "insufficient",
          availableMarks: balance ?? 0,
          shortfallMarks: 25 - (balance ?? 0),
        });
      } finally {
        f.restore();
      }
    },
  );

  test("completeCheckout rejects first-installment reservations no longer reserved", async () => {
    const pending = {
      ...enrollment,
      state: "checkout_pending",
      checkoutExpiresAt: new Date(now.getTime() + 60_000),
    };
    const first = {
      id: "first",
      enrollmentId: enrollment.id,
      ordinal: 1,
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      state: "checkout_pending",
    };
    const f = fixture({
      findEnrollment: mock(async () => pending),
      findAllocations: mock(async () => [
        {
          installmentId: first.id,
          sessionId: session.id,
          state: "funded",
          rateMarks: 25,
        },
      ]),
      lockSessions: mock(async () => [session]),
      findInstallments: mock(async () => [first]),
      getClassForEnrollment: mock(async () => classRecord),
    });
    try {
      await expect(
        f.service.completeCheckout("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test("paySecondInstallment reports a defaulting race", async () => {
    const active = { ...enrollment, state: "active" };
    const second = {
      id: "second",
      enrollmentId: enrollment.id,
      ordinal: 2,
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      state: "pending",
      dueSessionId: session.id,
      dueAt: now,
    };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => [
        { sessionId: session.id, state: "unfunded_reserved" },
      ]),
      lockSessions: mock(async () => [{ ...session, startAt: now }]),
      findInstallment: mock(async () => second),
      markInstallmentDefaulted: mock(async () => null),
    });
    try {
      await expect(
        f.service.paySecondInstallment("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test("paySecondInstallment rejects allocations no longer reserved for payment", async () => {
    const active = { ...enrollment, state: "active" };
    const second = {
      id: "second",
      enrollmentId: enrollment.id,
      ordinal: 2,
      rateMarks: 25,
      sessionCount: 1,
      amountMarks: 25,
      state: "pending",
      dueSessionId: session.id,
      dueAt: session.startAt,
    };
    const allocation = {
      installmentId: second.id,
      sessionId: session.id,
      state: "funded",
      rateMarks: 25,
    };
    const f = fixture({
      findEnrollment: mock(async () => active),
      findAllocations: mock(async () => [allocation]),
      lockSessions: mock(async () => [session]),
      findInstallment: mock(async () => second),
    });
    try {
      await expect(
        f.service.paySecondInstallment("student1", enrollment.id),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  function createCancellationFixture(
    state: string,
    wallet: unknown = null,
    options: { unfunded?: boolean; rounding?: boolean } = {},
  ) {
    const cancellationSession = {
      ...session,
      startAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    };
    const allocation = {
      id: "allocation-1",
      enrollmentId: enrollment.id,
      installmentId: "first",
      sessionId: cancellationSession.id,
      state: options.unfunded ? "unfunded_reserved" : "funded",
      rateMarks: options.rounding ? 2 : 25,
      fundedMarks: options.unfunded ? 0 : options.rounding ? 2 : 25,
      spentMarks: 0,
      releasedMarks: 0,
      fundingSourceReference: "allocation-source",
    };
    const allocations = options.rounding
      ? [
          { ...allocation, id: "a" },
          {
            ...allocation,
            id: "b",
            sessionId: "session2",
            rateMarks: 1,
            fundedMarks: 1,
          },
        ]
      : [allocation];
    return {
      ...fixture(
        {
          findEnrollment: mock(async () => ({ ...enrollment, state })),
          findAllocations: mock(async () => allocations),
          lockSessions: mock(async () =>
            allocations.map((item) => ({
              ...cancellationSession,
              id: item.sessionId,
            })),
          ),
          findInstallments: mock(async () => []),
          findCancellationReceipt: mock(async () => null),
          getClassForEnrollment: mock(async () => classRecord),
          getWalletByUser: mock(async () => wallet),
          saveCancellation: mock(async () => undefined),
        },
        { write: mock(async () => undefined) },
        {},
        {
          hold: mock(async () => undefined),
          deduct: mock(async () => undefined),
          release: mock(async () => undefined),
        },
      ),
      cancellationSession,
    };
  }

  test("unfunded whole-plan withdrawal does not require a wallet or move Marks", async () => {
    const f = createCancellationFixture("active", null, { unfunded: true });
    try {
      const input = { enrollmentId: enrollment.id };
      const quote = await f.service.quoteCancellation("student1", input);
      expect(
        await f.service.confirmCancellation("student1", {
          ...input,
          quoteVersion: quote.quoteVersion,
          requestKey: crypto.randomUUID(),
        }),
      ).toMatchObject({
        feeMarks: 0,
        returnMarks: 0,
        unpaidAllocationIds: ["allocation-1"],
      });
      expect(f.wallet.deduct).not.toHaveBeenCalled();
      expect(f.wallet.release).not.toHaveBeenCalled();
    } finally {
      f.restore();
    }
  });

  test("cumulative fee rounding skips a zero-return allocation without creating a zero-value release", async () => {
    const f = createCancellationFixture(
      "active",
      { id: "wallet1" },
      { rounding: true },
    );
    try {
      const input = { enrollmentId: enrollment.id };
      const quote = await f.service.quoteCancellation("student1", input);
      expect(
        await f.service.confirmCancellation("student1", {
          ...input,
          quoteVersion: quote.quoteVersion,
          requestKey: crypto.randomUUID(),
        }),
      ).toMatchObject({ feeMarks: 1, returnMarks: 2 });
      expect(f.wallet.deduct).toHaveBeenCalledTimes(1);
      expect(f.wallet.release).toHaveBeenCalledTimes(1);
      expect(f.wallet.release).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ amount: 2 }),
      );
    } finally {
      f.restore();
    }
  });

  test("refuses cancellation for a non-active enrollment", async () => {
    const f = createCancellationFixture("checkout_pending");
    try {
      await expect(
        f.service.quoteCancellation("student1", {
          enrollmentId: enrollment.id,
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_INVALID_OPERATION" });
    } finally {
      f.restore();
    }
  });

  test("confirmation rejects a stale cancellation quote", async () => {
    const f = createCancellationFixture("active");
    const input = {
      enrollmentId: enrollment.id,
      sessionId: f.cancellationSession.id,
    };
    try {
      const quote = await f.service.quoteCancellation("student1", input);
      await expect(
        f.service.confirmCancellation("student1", {
          ...input,
          requestKey: crypto.randomUUID(),
          quoteVersion: "f".repeat(64),
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
      expect(quote.quoteVersion).not.toBe("f".repeat(64));
    } finally {
      f.restore();
    }
  });

  test("confirmation refuses to change Marks when the wallet is missing", async () => {
    const f = createCancellationFixture("active");
    const input = {
      enrollmentId: enrollment.id,
      sessionId: f.cancellationSession.id,
    };
    try {
      const quote = await f.service.quoteCancellation("student1", input);
      await expect(
        f.service.confirmCancellation("student1", {
          ...input,
          requestKey: crypto.randomUUID(),
          quoteVersion: quote.quoteVersion,
        }),
      ).rejects.toMatchObject({ code: "CLASS_ENROLLMENT_CONFLICT" });
    } finally {
      f.restore();
    }
  });

  test("due jobs expire checkouts, default late installments, and queue reminders", async () => {
    let installmentReads = 0;
    let sessionLockReads = 0;
    const expiresAt = new Date(now.getTime() - 1);
    const dueSession = { ...session, startAt: new Date(now.getTime() - 1) };
    const reminderSession = {
      ...session,
      startAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    };
    const secondInstallment = {
      id: "second",
      enrollmentId: enrollment.id,
      ordinal: 2,
      amountMarks: 25,
      state: "pending",
      dueSessionId: session.id,
      dueAt: reminderSession.startAt,
      reminder7dProcessedAt: null,
      reminder7dForAt: null,
      reminder1dProcessedAt: null,
      reminder1dForAt: null,
    };
    const notificationWrite = mock(async () => undefined);
    const reportReminderRepo = spyOn(
      reportReminderRepoModule,
      "createClassReportReminderRepo",
    ).mockReturnValue({
      findDue: mock(async () => []),
      writeIfPending: mock(async () => false),
    } as unknown as ReturnType<
      typeof reportReminderRepoModule.createClassReportReminderRepo
    >);
    const f = fixture(
      {
        findExpiredCheckouts: mock(async () => [{ id: "expired-checkout" }]),
        findDueInstallments: mock(async () => [
          { enrollmentId: enrollment.id, installmentId: "second" },
        ]),
        findReminderCandidates: mock(async () => [
          { enrollmentId: enrollment.id, installmentId: "second" },
        ]),
        findEnrollmentById: mock(async (_tx: unknown, id: string) => {
          if (id === "expired-checkout") {
            return {
              ...enrollment,
              id,
              state: "checkout_pending",
              checkoutExpiresAt: expiresAt,
            };
          }
          return { ...enrollment, state: "active", studentId: "student1" };
        }),
        findInstallment: mock(async () => {
          installmentReads += 1;
          return {
            ...secondInstallment,
            dueAt:
              installmentReads === 1
                ? dueSession.startAt
                : reminderSession.startAt,
          };
        }),
        lockSessions: mock(async () => {
          sessionLockReads += 1;
          if (sessionLockReads === 2) return [dueSession];
          if (sessionLockReads === 3) return [reminderSession];
          return [];
        }),
        markInstallmentDefaulted: mock(async () => true),
        releaseCheckout: mock(async () => undefined),
        markReminderProcessed: mock(async () => undefined),
      },
      { write: notificationWrite },
    );
    try {
      await expect(f.service.processDueJobs()).resolves.toMatchObject({
        expiredCheckouts: 1,
        defaultedInstallments: 1,
        remindersQueued: 1,
        reportRemindersQueued: 0,
        reportRemindersFailed: 0,
      });
      expect(notificationWrite).toHaveBeenCalledTimes(1);
    } finally {
      f.restore();
      reportReminderRepo.mockRestore();
    }
  });

  test.each([10, null])(
    "top-up quote computes the shortfall with available balance %s",
    async (balance) => {
      const shortfall = 25 - (balance ?? 0);
      const attempt = {
        id: crypto.randomUUID(),
        installmentId: "first-installment",
        requestKey: crypto.randomUUID(),
        requestedMarks: shortfall,
        choice: null,
        quoteId: null,
      };
      const quote = {
        quoteId: "quote-1",
        marks: shortfall,
        revision: 1,
        customAmountIdr: 15000,
        exactPackage: null,
        recommendedPackage: null,
        expiresAt: new Date(now.getTime() + 60_000),
      };
      let requestLookups = 0;
      const updateTopUpAttempt = mock(async () => undefined);
      const createTopUpQuote = mock(async () => quote);
      const f = fixture(
        {
          findEnrollment: mock(async () => ({
            ...enrollment,
            state: "checkout_pending",
            checkoutExpiresAt: new Date(now.getTime() + 60_000),
          })),
          findInstallment: mock(async () => ({
            id: attempt.installmentId,
            state: "checkout_pending",
            amountMarks: 25,
          })),
          findTopUpAttemptByRequestKey: mock(async () =>
            ++requestLookups === 1 ? null : attempt,
          ),
          getWalletByUser: mock(async () =>
            balance === null ? null : { availableBalance: balance },
          ),
          insertTopUpAttempt: mock(async () => attempt),
          updateTopUpAttempt,
        },
        {},
        { createTopUpQuote },
      );
      try {
        await expect(
          f.service.createTopUpQuote("student1", {
            enrollmentId: crypto.randomUUID(),
            ordinal: 1,
            requestKey: attempt.requestKey,
          }),
        ).resolves.toMatchObject({
          attemptId: attempt.id,
          requestedMarks: shortfall,
          quoteId: quote.quoteId,
          choice: null,
        });
        expect(createTopUpQuote).toHaveBeenCalledWith("student1", {
          requestKey: attempt.id,
          marks: shortfall,
        });
        expect(updateTopUpAttempt).toHaveBeenCalledWith(
          expect.anything(),
          attempt.id,
          expect.objectContaining({ quoteId: quote.quoteId }),
        );
      } finally {
        f.restore();
      }
    },
  );

  test.each([
    "missing-enrollment",
    "missing-installment",
    "expired-checkout",
    "sufficient-wallet",
  ] as const)("top-up quote rejects %s", async (scenario) => {
    const f = fixture({
      findEnrollment: mock(async () =>
        scenario === "missing-enrollment"
          ? null
          : {
              ...enrollment,
              state:
                scenario === "expired-checkout"
                  ? "expired"
                  : "checkout_pending",
              checkoutExpiresAt: new Date(now.getTime() + 60_000),
            },
      ),
      findInstallment: mock(async () =>
        scenario === "missing-installment"
          ? null
          : { id: "first", state: "checkout_pending", amountMarks: 25 },
      ),
      findTopUpAttemptByRequestKey: mock(async () => null),
      getWalletByUser: mock(async () => ({ availableBalance: 25 })),
    });
    try {
      await expect(
        f.service.createTopUpQuote("student1", {
          enrollmentId: crypto.randomUUID(),
          ordinal: 1,
          requestKey: crypto.randomUUID(),
        }),
      ).rejects.toMatchObject({
        code:
          scenario === "missing-enrollment"
            ? "CLASS_ENROLLMENT_NOT_FOUND"
            : scenario === "missing-installment"
              ? "CLASS_ENROLLMENT_INVALID_OPERATION"
              : "CLASS_ENROLLMENT_CONFLICT",
      });
    } finally {
      f.restore();
    }
  });

  test.each(["missing-attempt", "changed-choice", "missing-quote"] as const)(
    "top-up purchase rejects %s",
    async (scenario) => {
      const f = fixture(
        {
          findTopUpAttemptForStudent: mock(async () => {
            if (scenario === "missing-attempt") return null;
            return {
              attempt: {
                id: "attempt-1",
                quoteId: scenario === "missing-quote" ? null : "quote-1",
                choice: scenario === "changed-choice" ? "package" : null,
              },
            };
          }),
        },
        {},
        {},
        {
          hold: mock(async () => undefined),
          getOrCreate: mock(async () => ({ id: "wallet-1" })),
        },
      );
      try {
        await expect(
          f.service.purchaseTopUp("student1", {
            attemptId: crypto.randomUUID(),
            choice: "custom",
          }),
        ).rejects.toMatchObject({
          code:
            scenario === "missing-attempt"
              ? "CLASS_ENROLLMENT_NOT_FOUND"
              : "CLASS_ENROLLMENT_CONFLICT",
        });
      } finally {
        f.restore();
      }
    },
  );
});
