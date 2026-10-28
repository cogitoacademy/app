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
