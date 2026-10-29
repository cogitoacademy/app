import { describe, expect, mock, spyOn, test } from "bun:test";
import * as enrollmentRepoModule from "../../modules/class-enrollment/class-enrollment.repo";
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

function fixture(overrides: Record<string, unknown> = {}) {
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
  const wallet = { hold: mock(async () => undefined) };
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ execute: async () => undefined }),
  };
  const service = createClassEnrollmentService({
    db,
    wallet,
    payment: {},
    notification: {},
    appBaseUrl: "https://example.test",
    clock: () => now,
  } as unknown as Parameters<typeof createClassEnrollmentService>[0]);
  return { service, wallet, repo, restore: () => factory.mockRestore() };
}

describe("class enrollment locked request replay", () => {
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
});

describe("class enrollment checkout recovery", () => {
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

  test("completeCheckout returns an insufficient-balance summary", async () => {
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
      findAllocations: mock(async () => [allocation]),
      lockSessions: mock(async () => [session]),
      findInstallments: mock(async () => [first]),
      getWalletByUser: mock(async () => null),
    });
    try {
      await expect(
        f.service.completeCheckout("student1", enrollment.id),
      ).resolves.toMatchObject({
        outcome: "insufficient",
        availableMarks: 0,
        shortfallMarks: 25,
      });
    } finally {
      f.restore();
    }
  });

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

  function createCancellationFixture(state: string, wallet: unknown = null) {
    const cancellationSession = {
      ...session,
      startAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    };
    const allocation = {
      id: "allocation-1",
      enrollmentId: enrollment.id,
      installmentId: "first",
      sessionId: cancellationSession.id,
      state: "funded",
      rateMarks: 25,
      fundedMarks: 25,
      spentMarks: 0,
      releasedMarks: 0,
      fundingSourceReference: "allocation-source",
    };
    return {
      ...fixture({
        findEnrollment: mock(async () => ({ ...enrollment, state })),
        findAllocations: mock(async () => [allocation]),
        lockSessions: mock(async () => [cancellationSession]),
        findInstallments: mock(async () => []),
        findCancellationReceipt: mock(async () => null),
        getClassForEnrollment: mock(async () => classRecord),
        getWalletByUser: mock(async () => wallet),
      }),
      cancellationSession,
    };
  }

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
});
