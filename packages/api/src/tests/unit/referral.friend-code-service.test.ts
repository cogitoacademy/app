import { expect, test, mock } from "bun:test";
import { createReferralService } from "../../modules/referral/referral.service";
import { createReferralHandler } from "../../modules/referral/referral.handler";
import { ReferralError } from "../../modules/referral/referral.errors";

// Scripted query results exercise getMine wiring without opening a database.
function fixture(results: unknown[][], saveReturnsRow = true) {
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const db = {
    execute: async () => undefined,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    select: () => {
      const rows = results.shift();
      if (!rows) throw new Error("Unexpected select");
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        orderBy: () => query,
        for: async () => rows,
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
        return {
          onConflictDoNothing: async () => undefined,
          returning: async () =>
            saveReturnsRow ? [{ id: "saved-choice", ...value }] : [],
        };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updates.push(value);
        return { where: async () => undefined };
      },
    }),
  };
  const wallet = {
    getOrCreate: mock(async () => ({ id: "wallet-id" })),
    credit: mock(async () => undefined),
  };
  const audit = { record: mock(async () => undefined) };
  const service = createReferralService({
    db,
    wallet,
    audit,
    clock: () => new Date("2026-10-28T00:00:00Z"),
  } as unknown as Parameters<typeof createReferralService>[0]);
  return {
    service,
    inserted,
    results,
    updates,
    wallet,
    audit,
    db: db as unknown as Parameters<typeof service.applyEmailSignupChoice>[0],
  };
}

test.each([
  "free",
  "missing-choice",
  "kol",
  "missing-referrer",
  "missing-student",
  "changed-role",
] as const)(
  "first completion skips ineligible referral rewards: %s",
  async (scenario) => {
    const choice = {
      id: "choice1",
      kind: "friend",
      referrerUserId: "referrer1",
    };
    const rows: unknown[][] =
      scenario === "free"
        ? []
        : scenario === "missing-choice"
          ? [[]]
          : scenario === "kol"
            ? [[{ ...choice, kind: "kol" }]]
            : scenario === "missing-referrer"
              ? [[{ ...choice, referrerUserId: null }]]
              : [
                  [choice],
                  [],
                  scenario === "missing-student"
                    ? [{ id: "referrer1", role: "student" }]
                    : [
                        { id: "referrer1", role: "student" },
                        { id: "student1", role: "tutor" },
                      ],
                ];
    const f = fixture(rows);
    await expect(
      f.service.recordEligibleFirstCompletion(f.db, {
        studentId: "student1",
        completionType: "solo",
        completionId: "booking1",
        completedAt: new Date("2026-10-28T00:00:00Z"),
        chargedMarks: scenario === "free" ? 0 : 10,
      }),
    ).resolves.toBeNull();
    expect(f.results).toEqual([]);
    expect(f.inserted).toEqual([]);
    expect(f.wallet.credit).not.toHaveBeenCalled();
  },
);

test.each(["usage", "decision"] as const)(
  "first completion requires a persisted %s row",
  async (scenario) => {
    const f = fixture(
      [
        [
          {
            id: "choice1",
            kind: "friend",
            referrerUserId: "referrer1",
            friendRewardMarksSnapshot: 10,
          },
        ],
        [],
        [
          { id: "student1", role: "student" },
          { id: "referrer1", role: "student" },
        ],
        [],
        scenario === "usage" ? [] : [{ id: "usage1", creditedMarks: 0 }],
      ],
      false,
    );
    await expect(
      f.service.recordEligibleFirstCompletion(f.db, {
        studentId: "student1",
        completionType: "solo",
        completionId: "booking1",
        completedAt: new Date("2026-10-28T00:00:00Z"),
        chargedMarks: 10,
      }),
    ).rejects.toThrow(
      scenario === "usage"
        ? "Referral semester usage was not locked."
        : "Friend reward decision was not saved.",
    );
    expect(f.wallet.credit).not.toHaveBeenCalled();
    expect(f.results).toEqual([]);
  },
);

test("signup rejects invalid referral identities before crediting a wallet", async () => {
  const student = [{ role: "student" }];
  const friend = [
    { id: "code-id", kind: "friend", referrerUserId: "referrer-id" },
  ];
  const cases = [
    { rows: [[]], code: "ABC123", error: "REFERRAL_STUDENT_ONLY" },
    {
      rows: [[{ role: "tutor" }]],
      code: "ABC123",
      error: "REFERRAL_STUDENT_ONLY",
    },
    { rows: [student, []], code: "???", error: "INVALID_REFERRAL_CODE" },
    {
      rows: [student, [], [], []],
      code: "ABC123",
      error: "INVALID_REFERRAL_CODE",
    },
    {
      rows: [
        student,
        [],
        [],
        [{ id: "code-id", kind: "friend", referrerUserId: "student-id" }],
      ],
      code: "ABC123",
      error: "SELF_REFERRAL",
    },
    {
      rows: [student, [], [], friend, [{ role: "tutor" }]],
      code: "ABC123",
      error: "INVALID_REFERRAL_CODE",
    },
    {
      rows: [
        student,
        [],
        [],
        [{ id: "code-id", kind: "kol", campaignId: null }],
      ],
      code: "ABC123",
      error: "INVALID_REFERRAL_CODE",
    },
    {
      rows: [
        student,
        [],
        [],
        [{ id: "code-id", kind: "kol", campaignId: "campaign-id" }],
        [],
      ],
      code: "ABC123",
      error: "INVALID_REFERRAL_CODE",
    },
  ];
  await Promise.all(
    cases.map(async ({ rows, code, error }) => {
      const f = fixture(rows);
      await expect(
        f.service.applyEmailSignupChoice(f.db, { userId: "student-id", code }),
      ).rejects.toMatchObject({ code: error });
      expect(f.wallet.credit).not.toHaveBeenCalled();
      expect(f.inserted).toEqual([]);
      expect(f.results).toEqual([]);
    }),
  );
  const tutor = fixture([[{ role: "tutor" }]]);
  expect(
    await tutor.service.applyEmailSignupChoice(tutor.db, {
      userId: "tutor-id",
    }),
  ).toBeNull();
});

test("a Google friend referral credits the welcome reward and links its ledger entry", async () => {
  const f = fixture([
    [{ role: "student", referralChoicePending: true }],
    [],
    [{ role: "student" }],
    [],
    [],
    [{ id: "code-id", kind: "friend", referrerUserId: "referrer-id" }],
    [{ role: "student" }],
    [{ id: "ledger-id" }],
  ]);
  expect(
    await f.service.saveGoogleChoice("student-id", { code: " abc123 " }),
  ).toMatchObject({
    kind: "friend",
    codeSnapshot: "ABC123",
    welcomeLedgerEntryId: "ledger-id",
  });
  expect(f.wallet.credit).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      amount: 15,
      walletId: "wallet-id",
      eventKey: "referral.signup.student-id",
      sourceReference: "saved-choice",
    }),
  );
  expect(f.updates).toEqual([
    { welcomeLedgerEntryId: "ledger-id" },
    { referralChoicePending: false },
  ]);
  expect(f.results).toEqual([]);
});

test("Google referral choice requires a pending student account", async () => {
  const missing = fixture([[]]);
  await expect(
    missing.service.saveGoogleChoice("student-id", { code: null }),
  ).rejects.toMatchObject({ code: "REFERRAL_STUDENT_ONLY" });
  const tutor = fixture([[{ role: "tutor", referralChoicePending: true }], []]);
  await expect(
    tutor.service.saveGoogleChoice("tutor-id", { code: null }),
  ).rejects.toMatchObject({ code: "REFERRAL_STUDENT_ONLY" });
  const decided = fixture([
    [{ role: "student", referralChoicePending: false }],
    [],
  ]);
  await expect(
    decided.service.saveGoogleChoice("student-id", { code: null }),
  ).rejects.toMatchObject({ code: "REFERRAL_CHOICE_REQUIRED" });
  expect(decided.inserted).toEqual([]);
  expect(decided.updates).toEqual([]);
});

test("Google referral choice replays the saved choice without another reward", async () => {
  const choice = {
    id: "existing-choice",
    kind: "friend",
    welcomeMarksSnapshot: 15,
  };
  const f = fixture([
    [{ role: "student", referralChoicePending: true }],
    [choice],
  ]);
  expect(
    await f.service.saveGoogleChoice("student-id", { code: "OTHER1" }),
  ).toEqual(choice);
  expect(f.inserted).toEqual([]);
  expect(f.wallet.credit).not.toHaveBeenCalled();
});

test("skipping a Google referral records the decision and clears the pending flag", async () => {
  const f = fixture([
    [{ role: "student", referralChoicePending: true }],
    [],
    [{ role: "student" }],
    [],
    [],
  ]);
  expect(
    await f.service.saveGoogleChoice("student-id", { code: null }),
  ).toMatchObject({
    kind: "none",
    welcomeMarksSnapshot: 0,
    settingsVersion: 0,
  });
  expect(f.updates).toEqual([{ referralChoicePending: false }]);
  expect(f.wallet.credit).not.toHaveBeenCalled();
  expect(f.results).toEqual([]);
});

test("referral settings use the default policy until a revision is present", async () => {
  const f = fixture([
    [],
    [
      {
        version: 2,
        welcomeMarks: 10,
        friendRewardMarks: 20,
        semesterCapMarks: 80,
      },
    ],
  ]);
  expect(await f.service.getSettings()).toEqual({
    version: 0,
    welcomeMarks: 15,
    friendRewardMarks: 15,
    semesterCapMarks: 75,
  });
  expect(await f.service.getSettings()).toMatchObject({
    version: 2,
    welcomeMarks: 10,
  });
});

test("settings updates reject stale versions and audit a new revision", async () => {
  const input = {
    expectedVersion: 0,
    welcomeMarks: 10,
    friendRewardMarks: 20,
    semesterCapMarks: 80,
    reason: "Updated referral policy",
  };
  const stale = fixture([[{ version: 2 }]]);
  await expect(
    stale.service.updateSettings("admin-id", input),
  ).rejects.toMatchObject({ code: "REFERRAL_SETTINGS_CONFLICT" });
  expect(stale.inserted).toEqual([]);
  const f = fixture([[]]);
  expect(await f.service.updateSettings("admin-id", input)).toMatchObject({
    version: 1,
    welcomeMarks: 10,
    changedBy: "admin-id",
  });
  expect(f.audit.record).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "referral_settings_updated",
      details: { reason: input.reason },
    }),
  );
});

test("campaign creation validates its dates, maps duplicate codes and preserves other failures", async () => {
  const input = {
    name: "October campaign",
    code: "KOL123",
    expiresAt: new Date("2026-11-01T00:00:00Z"),
    attributionWindowDays: 90,
    flatAmountIdr: 10000,
    percentBps: 0,
  };
  const f = fixture([]);
  await expect(
    f.service.createKolCampaign("admin-id", {
      ...input,
      expiresAt: new Date("2026-10-28T00:00:00Z"),
    }),
  ).rejects.toMatchObject({ code: "REFERRAL_CAMPAIGN_INVALID" });
  expect(await f.service.createKolCampaign("admin-id", input)).toMatchObject({
    code: "KOL123",
    activationAt: new Date("2026-10-28T00:00:00Z"),
  });
  expect(f.audit.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "kol_referral_campaign_created" }),
  );
  Object.assign(f.db, {
    transaction: async () => {
      throw { code: "23505" };
    },
  });
  await expect(
    f.service.createKolCampaign("admin-id", input),
  ).rejects.toMatchObject({ code: "REFERRAL_CODE_TAKEN" });
  const unavailable = new Error("Database unavailable");
  Object.assign(f.db, {
    transaction: async () => {
      throw unavailable;
    },
  });
  await expect(f.service.createKolCampaign("admin-id", input)).rejects.toBe(
    unavailable,
  );
});

test("admin campaign listing returns the campaign and its referral code", async () => {
  const campaign = {
    id: "campaign-id",
    name: "October campaign",
    code: "KOL123",
  };
  const f = fixture([[campaign]]);
  expect(await f.service.listKolCampaigns()).toEqual([campaign]);
  expect(f.results).toEqual([]);
});

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

test("signup without a code is a no-op for a non-student account", async () => {
  const f = fixture([[{ id: "tutor-id", role: "tutor" }]]);
  await expect(
    f.service.applyEmailSignupChoice(f.db, { userId: "tutor-id" }),
  ).resolves.toBeNull();
  expect(f.results).toEqual([]);
  expect(f.inserted).toEqual([]);
  expect(f.wallet.getOrCreate).not.toHaveBeenCalled();
});

test("signup reports a missing account as student-only", async () => {
  const f = fixture([[]]);
  await expect(
    f.service.applyEmailSignupChoice(f.db, { userId: "deleted-user" }),
  ).rejects.toMatchObject({ code: "REFERRAL_STUDENT_ONLY" });
  expect(f.inserted).toEqual([]);
});

test("signup preserves an existing choice without validating a replacement", async () => {
  const existing = { id: "choice-old", userId: "student-id", kind: "none" };
  const f = fixture([[{ id: "student-id", role: "student" }], [existing]]);
  await expect(
    f.service.applyEmailSignupChoice(f.db, {
      userId: "student-id",
      code: "INVALID!!!",
    }),
  ).resolves.toEqual(existing);
  expect(f.inserted).toEqual([]);
  expect(f.wallet.credit).not.toHaveBeenCalled();
});

test("signup rejects a choice that the database did not persist", async () => {
  const f = fixture([[{ id: "student-id", role: "student" }], [], []], false);
  await expect(
    f.service.applyEmailSignupChoice(f.db, { userId: "student-id" }),
  ).rejects.toThrow("Referral choice was not saved.");
  expect(f.inserted).toHaveLength(1);
  expect(f.wallet.getOrCreate).not.toHaveBeenCalled();
});

test("settings refuses a missing persisted revision without auditing success", async () => {
  const f = fixture([[]], false);
  await expect(
    f.service.updateSettings("admin-id", {
      expectedVersion: 0,
      welcomeMarks: 10,
      friendRewardMarks: 20,
      semesterCapMarks: 80,
      reason: "Updated policy",
    }),
  ).rejects.toThrow("Referral settings were not saved.");
  expect(f.audit.record).not.toHaveBeenCalled();
});

test("Google choice refuses an unpersisted decision without clearing pending", async () => {
  const f = fixture(
    [
      [{ role: "student", referralChoicePending: true }],
      [],
      [{ role: "student" }],
      [],
      [],
    ],
    false,
  );
  await expect(
    f.service.saveGoogleChoice("student-id", { code: null }),
  ).rejects.toThrow("Referral choice was not saved.");
  expect(f.updates).toEqual([]);
});

test.each(["campaign", "code"] as const)(
  "campaign creation requires persisted %s",
  async (missing) => {
    const f = fixture([], missing !== "campaign");
    if (missing === "code") {
      let inserts = 0;
      Object.assign(f.db, {
        insert: () => ({
          values: (value: unknown) => ({
            returning: async () =>
              ++inserts === 1
                ? [{ id: "campaign-id", ...(value as object) }]
                : [],
          }),
        }),
      });
    }
    await expect(
      f.service.createKolCampaign("admin-id", {
        name: "Campaign",
        code: "KOL123",
        expiresAt: new Date("2026-11-01T00:00:00Z"),
        attributionWindowDays: 90,
        flatAmountIdr: 10000,
        percentBps: 0,
      }),
    ).rejects.toThrow(
      missing === "campaign"
        ? "KOL campaign was not saved."
        : "KOL campaign code was not saved.",
    );
    expect(f.audit.record).not.toHaveBeenCalled();
  },
);

const settlementDecision = {
  id: "decision-id",
  commissionAmountIdr: 10000,
  paymentStatusSnapshot: "SUCCESS",
  providerSuccessTimeState: "resolved",
};

test("settlement rejects a decision removed before its snapshot", async () => {
  const f = fixture([[], []]);
  await expect(
    f.service.getKolSettlement({ decisionId: "missing" }),
  ).rejects.toMatchObject({ code: "KOL_SETTLEMENT_INVALID" });
  expect(f.results).toEqual([]);
});

test.each(["refunded", "unresolved", "negative"] as const)(
  "adjustment rejects %s obligation",
  async (scenario) => {
    const decision = {
      ...settlementDecision,
      ...(scenario === "refunded" ? { paymentStatusSnapshot: "REFUNDED" } : {}),
      ...(scenario === "unresolved"
        ? { providerSuccessTimeState: "unresolved" }
        : {}),
    };
    const f = fixture([[], [decision], [], []]);
    await expect(
      f.service.adjustKolCommission("admin-id", {
        decisionId: decision.id,
        operationId: "adjust-1",
        amountIdr: -10001,
        expectedObligationIdr: scenario === "negative" ? 10000 : 0,
        reason: "Reconcile",
      }),
    ).rejects.toMatchObject({ code: "KOL_SETTLEMENT_INVALID" });
    expect(f.inserted).toEqual([]);
    expect(f.audit.record).not.toHaveBeenCalled();
  },
);

test("transfer rejects future payment dates before inserting", async () => {
  const f = fixture([[], [settlementDecision], [], []]);
  await expect(
    f.service.recordKolTransfer("admin-id", {
      decisionId: settlementDecision.id,
      operationId: "transfer-1",
      amountIdr: 1000,
      paidAt: new Date("2026-10-29T00:00:00Z"),
      reference: "bank-ref",
    }),
  ).rejects.toMatchObject({ code: "KOL_SETTLEMENT_INVALID" });
  expect(f.inserted).toEqual([]);
});

test("a concurrent settlement operation conflict does not audit a transfer", async () => {
  const f = fixture([[], [settlementDecision], [], []]);
  Object.assign(f.db, {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }),
  });
  await expect(
    f.service.recordKolTransfer("admin-id", {
      decisionId: settlementDecision.id,
      operationId: "transfer-1",
      amountIdr: 1000,
      paidAt: new Date("2026-10-27T00:00:00Z"),
      reference: "bank-ref",
    }),
  ).rejects.toMatchObject({ code: "KOL_SETTLEMENT_CONFLICT" });
  expect(f.audit.record).not.toHaveBeenCalled();
});

test("monthly settlement export rejects an oversized selection", async () => {
  const f = fixture([Array.from({ length: 5001 }, () => ({ id: "decision" }))]);
  await expect(
    f.service.exportKolMonthly({ month: "2026-10" }),
  ).rejects.toMatchObject({ code: "KOL_SETTLEMENT_INVALID" });
  expect(f.results).toEqual([]);
});

const kolPayment = {
  id: "payment-1",
  userId: "student-id",
  status: "PAID",
  amountIdr: 100000,
  providerSuccessAt: new Date("2026-10-27T00:00:00Z"),
};
const kolChoice = {
  id: "choice-id",
  kind: "kol",
  campaignId: "campaign-id",
  kolAttributionExpiresAt: new Date("2026-11-01T00:00:00Z"),
};

test.each([
  "missing",
  "pending",
  "missing-student",
  "tutor",
  "missing-time",
] as const)("KOL purchase refuses %s evidence", async (scenario) => {
  const rows: unknown[][] =
    scenario === "missing"
      ? [[]]
      : scenario === "pending"
        ? [[{ ...kolPayment, status: "PENDING" }]]
        : [
            [
              {
                ...kolPayment,
                ...(scenario === "missing-time"
                  ? { providerSuccessAt: new Date("invalid") }
                  : {}),
              },
            ],
            [kolChoice],
            scenario === "missing-student"
              ? []
              : [{ role: scenario === "tutor" ? "tutor" : "student" }],
          ];
  const f = fixture(rows);
  const result = f.service.recordSuccessfulKolTopUp(f.db, {
    paymentId: kolPayment.id,
  });
  if (scenario === "missing-time")
    await expect(result).rejects.toThrow(
      "explicitly marked as missing provider time",
    );
  else await expect(result).resolves.toBeNull();
  expect(f.inserted).toEqual([]);
  expect(f.audit.record).not.toHaveBeenCalled();
});

test.each(["hold-insert", "hold-update", "decision", "correction"] as const)(
  "KOL reconciliation requires persisted %s",
  async (scenario) => {
    const existing =
      scenario.endsWith("update") || scenario === "correction"
        ? [{ id: "old-decision", paymentId: "old-payment" }]
        : [];
    const held = scenario.startsWith("hold");
    const f = fixture(
      [
        [kolPayment],
        [kolChoice],
        [{ role: "student" }],
        existing,
        held ? [{ ...kolPayment, providerSuccessAt: null }] : [],
        ...(held ? [] : [[kolPayment]]),
      ],
      false,
    );
    if (existing.length)
      Object.assign(f.db, {
        update: () => ({
          set: () => ({ where: () => ({ returning: async () => [] }) }),
        }),
      });
    await expect(
      f.service.recordSuccessfulKolTopUp(f.db, { paymentId: kolPayment.id }),
    ).rejects.toThrow(
      held
        ? "KOL commission hold was not saved."
        : scenario === "correction"
          ? "KOL commission correction was not saved."
          : "KOL commission decision was not saved.",
    );
    expect(f.audit.record).not.toHaveBeenCalled();
    expect(f.results).toEqual([]);
  },
);

test("a first purchase outside attribution does not create a commission", async () => {
  const f = fixture([
    [kolPayment],
    [kolChoice],
    [{ role: "student" }],
    [],
    [],
    [{ ...kolPayment, providerSuccessAt: kolChoice.kolAttributionExpiresAt }],
  ]);
  await expect(
    f.service.recordSuccessfulKolTopUp(f.db, { paymentId: kolPayment.id }),
  ).resolves.toBeNull();
  expect(f.inserted).toEqual([]);
  expect(f.audit.record).not.toHaveBeenCalled();
});

test("Google referral does not clear pending if the account changes role during choice save", async () => {
  const f = fixture([
    [{ role: "student", referralChoicePending: true }],
    [],
    [{ role: "tutor" }],
  ]);
  await expect(
    f.service.saveGoogleChoice("student-id", { code: null }),
  ).rejects.toThrow("Referral choice was not saved.");
  expect(f.updates).toEqual([]);
});

test("friend code allocation preserves unexpected storage failures", async () => {
  const failure = new Error("Storage unavailable");
  const f = fixture([[{ role: "student", name: "Andre" }], [], [], [], [], []]);
  Object.assign(f.db, {
    insert: () => {
      throw failure;
    },
  });
  await expect(f.service.getMine("student-id")).rejects.toBe(failure);
});

test("welcome reward without a returned ledger row leaves ledger link unset", async () => {
  const f = fixture([
    [{ role: "student", referralChoicePending: true }],
    [],
    [{ role: "student" }],
    [],
    [],
    [{ id: "code-id", kind: "friend", referrerUserId: "referrer-id" }],
    [{ role: "student" }],
    [],
  ]);
  expect(
    await f.service.saveGoogleChoice("student-id", { code: "ABC123" }),
  ).not.toHaveProperty("welcomeLedgerEntryId");
  expect(f.wallet.credit).toHaveBeenCalledTimes(1);
  expect(f.updates).toEqual([{ referralChoicePending: false }]);
});

test("empty monthly export produces a CSV header without querying entries", async () => {
  const f = fixture([[]]);
  const result = await f.service.exportKolMonthly({ month: "2026-10" });
  expect(result).toBeDefined();
  expect(f.results).toEqual([]);
});

test.each(["missing-reward", "missing-ledger"] as const)(
  "first completion handles %s snapshot",
  async (scenario) => {
    const choice = {
      id: "choice-id",
      kind: "friend",
      referrerUserId: "referrer-id",
      ...(scenario === "missing-ledger"
        ? { friendRewardMarksSnapshot: 15 }
        : {}),
    };
    const f = fixture([
      [choice],
      [],
      [
        { id: "student-id", role: "student" },
        { id: "referrer-id", role: "student" },
      ],
      [],
      [{ id: "usage-id", creditedMarks: 0 }],
      ...(scenario === "missing-ledger" ? [[]] : []),
    ]);
    const result = await f.service.recordEligibleFirstCompletion(f.db, {
      studentId: "student-id",
      completionType: "solo",
      completionId: "booking-id",
      completedAt: new Date("2026-10-28T00:00:00Z"),
      chargedMarks: 10,
    });
    expect(result).toMatchObject({
      creditedMarks: scenario === "missing-ledger" ? 15 : 0,
    });
    expect(result).not.toHaveProperty("ledgerEntryId");
    expect(f.wallet.credit).toHaveBeenCalledTimes(
      scenario === "missing-ledger" ? 1 : 0,
    );
    expect(f.results).toEqual([]);
  },
);

test.each(["refunded", "partial", "missing-time"] as const)(
  "a held KOL purchase audits %s reconciliation",
  async (scenario) => {
    const unresolved = {
      ...kolPayment,
      status: scenario === "refunded" ? "REFUNDED" : "PAID",
      providerSuccessAt: null,
      providerRefundKind: scenario === "partial" ? "partial" : null,
      providerRefundAmountIdr: 100,
      providerRefundIdentity: "refund-id",
    };
    const f = fixture([
      [kolPayment],
      [kolChoice],
      [{ role: "student" }],
      [
        {
          id: "decision-id",
          paymentId: "older-payment",
          paymentStatusSnapshot: "PAID",
        },
      ],
      [unresolved],
    ]);
    Object.assign(f.db, {
      update: () => ({
        set: (value: object) => ({
          where: () => ({
            returning: async () => [{ id: "decision-id", ...value }],
          }),
        }),
      }),
    });
    expect(
      await f.service.recordSuccessfulKolTopUp(f.db, {
        paymentId: kolPayment.id,
      }),
    ).toMatchObject({
      providerSuccessTimeState: "unresolved",
      commissionAmountIdr: 0,
    });
    expect(f.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action:
          scenario === "refunded"
            ? "kol_commission_refund_invalidation"
            : scenario === "partial"
              ? "kol_commission_partial_refund_reconciliation"
              : "kol_commission_provider_time_unresolved",
      }),
    );
    expect(f.results).toEqual([]);
  },
);
