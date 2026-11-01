import { expect, test, type Page } from "@playwright/test";

const classId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const completedSessionId = "33333333-3333-4333-8333-333333333333";
const future = new Date(Date.now() + 14 * 86_400_000);
future.setMinutes(0, 0, 0);
const startAt = future.toISOString();
const endAt = new Date(future.getTime() + 60 * 60_000).toISOString();
const closed = new Date(Date.now() - 60_000).toISOString();
const opens = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
const competition = {
  id: "competition-fixture",
  name: "Mathematics",
  parent: null,
};

function classRecord() {
  return {
    id: classId,
    version: 1,
    kind: "cohort",
    state: "published",
    titleEn: "Synthetic algebra cohort",
    titleId: null,
    descriptionEn: "Synthetic class for isolated reschedule UI acceptance.",
    descriptionId: null,
    competition,
    competitionId: competition.id,
    coverKey: null,
    cohortFullRateMarks: 20,
    cohortHalfRateMarks: 22,
    cohortSingleRateMarks: 25,
    masterclassRateMarks: null,
    minimumEnrollment: 1,
    minimumCheckAt: null,
    postponementCount: 0,
    freeExitUntil: null,
    createdAt: startAt,
    sessions: [
      {
        id: sessionId,
        sequenceNumber: 1,
        titleEn: "Algebra session",
        titleId: null,
        curriculumEn: "Synthetic content",
        curriculumId: null,
        startAt,
        endAt,
        mode: "online",
        roomId: null,
        capacity: 10,
        state: "scheduled",
        version: 3,
        tutorId: "tutor-fixture",
        tutor: { name: "A. Tutor" },
        meeting: { status: "created" },
        tutorAbsence: null,
        tutorAbsences: [],
      },
      {
        id: completedSessionId,
        sequenceNumber: 2,
        titleEn: "Completed algebra session",
        titleId: null,
        curriculumEn: "Delivered content",
        curriculumId: null,
        startAt: new Date(future.getTime() - 7 * 86_400_000).toISOString(),
        endAt: new Date(
          future.getTime() - 6 * 86_400_000 - 23 * 60 * 60_000,
        ).toISOString(),
        mode: "online",
        roomId: null,
        capacity: 10,
        state: "completed",
        version: 4,
        tutorId: "tutor-fixture",
        tutor: { name: "A. Tutor" },
        meeting: { status: "created" },
        tutorAbsence: null,
        tutorAbsences: [],
      },
    ],
  };
}

async function mockApp(
  page: Page,
  role: "admin" | "student",
  exitUntil = opens,
) {
  const user = {
    id: `reschedule-${role}`,
    name: "Reschedule UI",
    email: "reschedule@example.test",
    role,
    emailVerified: true,
    image: null,
    createdAt: startAt,
    updatedAt: startAt,
  };
  const errors: string[] = [];
  const calls: { procedure: string; input: Record<string, unknown> }[] = [];
  const requests: Record<string, unknown>[] = [];
  let confirmMode: "success" | "stale" = "success";
  let enrollmentsCalls = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user,
        session: {
          id: "reschedule-ui-session",
          userId: user.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  await page.route("**/rpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedure = url.pathname.replace("/rpc/", "");
    const body = route.request().postDataJSON() as {
      json?: Record<string, unknown>;
    } | null;
    const input = body?.json ?? {};
    calls.push({ procedure, input });
    let data: unknown = [];
    if (procedure === "admin/listAcademyClasses") {
      const record = classRecord();
      data = input.state === "published" ? [record] : [];
    } else if (procedure === "admin/listCompetitionCatalog") data = [];
    else if (
      procedure === "adminTutor/listTutorProfiles" ||
      procedure === "room/list"
    )
      data = [];
    else if (procedure === "admin/rescheduleClassSession") {
      requests.push(input);
      data = classRecord();
    } else if (procedure === "classes/get") data = classRecord();
    else if (procedure === "classes/getMyEnrollments") {
      enrollmentsCalls += 1;
      const allocationState =
        enrollmentsCalls > 1 &&
        requests.some((request) => request.kind === "confirmed")
          ? "released"
          : "reserved";
      data = {
        classId,
        classState: "published",
        freeExitUntil: null,
        enrollments: [
          {
            id: "enrollment-fixture",
            plan: "single",
            state: "active",
            totalMarks: 20,
            firstInstallmentMarks: 20,
            secondInstallmentMarks: 0,
            sessionCount: 1,
            allocations: [
              {
                sessionId,
                state: allocationState,
                rateMarks: 20,
                fundedMarks: 20,
                scheduleChangeVersion: 2,
                scheduleChangeNotifiedAt: startAt,
                scheduleChangeExitUntil: exitUntil,
              },
              {
                sessionId: completedSessionId,
                state: "completed",
                rateMarks: 20,
                fundedMarks: 20,
                scheduleChangeVersion: null,
                scheduleChangeNotifiedAt: null,
                scheduleChangeExitUntil: null,
              },
            ],
            installments: [{ ordinal: 1, amountMarks: 20, state: "paid" }],
          },
        ],
        eligibleSessions: [],
      };
    } else if (procedure === "wallet/get")
      data = { totalBalance: 40, heldBalance: 20, availableBalance: 20 };
    else if (procedure === "classes/quoteChangedSessionCancellation") {
      data = {
        enrollmentId: input.enrollmentId,
        sessionId: input.sessionId,
        scheduleChangeVersion: input.scheduleChangeVersion,
        notifiedAt: startAt,
        exitUntil,
        refundableMarks: 20,
        fundingState: "funded",
        quoteVersion: "a".repeat(64),
      };
    } else if (procedure === "classes/confirmChangedSessionCancellation") {
      requests.push({ ...input, kind: "confirmed" });
      if (confirmMode === "stale") {
        confirmMode = "success";
        return route.fulfill({
          status: 409,
          json: {
            json: null,
            error: {
              code: "CONFLICT",
              message: "Schedule-change quote is stale",
            },
          },
        });
      }
      data = { outcome: "released" };
    } else if (procedure === "classes/list") data = [classRecord()];
    else if (procedure.includes("notification"))
      data = { items: [], nextCursor: null, count: 0 };
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  return {
    calls,
    errors,
    requests,
    setConfirmMode: (mode: "success" | "stale") => {
      confirmMode = mode;
    },
  };
}

async function assertNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
}

for (const width of [390, 1440]) {
  test(`admin reschedules only a scheduled session and keeps duration at ${width}px`, async ({
    page,
  }) => {
    const mock = await mockApp(page, "admin");
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin-classes");
    expect(
      await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    ).toBe("UTC");
    await expect(
      page.getByRole("heading", { name: "Class Studio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Change scheduled session time" }),
    ).toBeVisible();
    const row = page.getByRole("region", {
      name: "Change scheduled session time",
    });
    await row
      .getByRole("textbox", { name: "New date and start time" })
      .last()
      .fill("11:15");
    await row
      .getByRole("textbox", { name: "Reason for students" })
      .fill("Tutor schedule conflict");
    await row.getByRole("button", { name: "Update session time" }).click();
    await expect.poll(() => mock.requests.length).toBe(1);
    expect(mock.requests[0]).toMatchObject({
      sessionId,
      expectedVersion: 3,
      reason: "Tutor schedule conflict",
    });
    const payloadKeys = Object.keys(mock.requests[0]!);
    payloadKeys.sort();
    expect(payloadKeys).toEqual([
      "endAt",
      "expectedVersion",
      "reason",
      "sessionId",
      "startAt",
    ]);
    expect(
      new Date(String(mock.requests[0]!.endAt)).getTime() -
        new Date(String(mock.requests[0]!.startAt)).getTime(),
    ).toBe(60 * 60_000);
    expect(new Date(String(mock.requests[0]!.startAt)).getTime()).not.toBe(
      future.getTime(),
    );
    expect(
      new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "Asia/Jakarta",
      }).format(new Date(String(mock.requests[0]!.startAt))),
    ).toBe("11:15");
    await assertNoHorizontalOverflow(page);
    expect(mock.errors).toEqual([]);
  });

  test(`student quotes and confirms only the changed seat at ${width}px`, async ({
    page,
  }) => {
    const mock = await mockApp(page, "student");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/classes/${classId}`);
    await expect(
      page.getByText("Completed algebra session", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review seat cancellation" }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Review seat cancellation" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Cancel changed session seat?" }),
    ).toBeVisible();
    await expect(page.getByText(/penalty-free until/)).toBeVisible();
    await expect(page.getByText(/20/).last()).toBeVisible();
    await page
      .getByRole("button", { name: "Confirm seat cancellation" })
      .click();
    await expect
      .poll(
        () =>
          mock.requests.filter((request) => request.kind === "confirmed")
            .length,
      )
      .toBe(1);
    const request = mock.requests.find((item) => item.kind === "confirmed")!;
    expect(request).toMatchObject({
      enrollmentId: "enrollment-fixture",
      sessionId,
      scheduleChangeVersion: 2,
      quoteVersion: "a".repeat(64),
    });
    expect(request.requestKey).toEqual(expect.any(String));
    expect(
      mock.calls.find(
        (call) => call.procedure === "classes/quoteChangedSessionCancellation",
      )?.input,
    ).toMatchObject({
      enrollmentId: "enrollment-fixture",
      sessionId,
      scheduleChangeVersion: 2,
    });
    await assertNoHorizontalOverflow(page);
    expect(mock.errors).toEqual([]);
  });
}

test("expired, completed, and stale schedule-change seats cannot use an old quote", async ({
  page,
}) => {
  const mock = await mockApp(page, "student", closed);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/classes/${classId}`);
  await expect(page.getByText("Exit window closed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review seat cancellation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review seat cancellation" }),
  ).toHaveCount(0);
  expect(
    mock.calls.some(
      (call) => call.procedure === "classes/quoteChangedSessionCancellation",
    ),
  ).toBe(false);
  expect(mock.errors).toEqual([]);
});

test("stale quote refreshes from the server before another confirmation", async ({
  page,
}) => {
  const mock = await mockApp(page, "student");
  mock.setConfirmMode("stale");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/classes/${classId}`);
  await page.getByRole("button", { name: "Review seat cancellation" }).click();
  await page.getByRole("button", { name: "Confirm seat cancellation" }).click();
  await expect
    .poll(
      () =>
        mock.calls.filter(
          (call) =>
            call.procedure === "classes/quoteChangedSessionCancellation",
        ).length,
    )
    .toBe(2);
  await expect(
    page.getByRole("heading", { name: "Cancel changed session seat?" }),
  ).toBeVisible();
  expect(mock.errors).toEqual([]);
});
