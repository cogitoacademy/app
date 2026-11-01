import { expect, test, type Page } from "@playwright/test";

const sessionId = "f5c9727d-11d5-4290-83ae-b86c6b89c150";
const tutorId = "tutor-absence-owner";
const otherTutorId = "tutor-other";
const classId = "a9a54d20-9a42-48ec-9a9c-56f7600be9d2";

function reportRow({
  state = "scheduled",
  roleTutorId = tutorId,
  report = null,
  absenceReportedAt = null,
  absenceLate = null,
}: {
  state?: "scheduled" | "completed" | "cancelled";
  roleTutorId?: string;
  report?: unknown;
  absenceReportedAt?: string | null;
  absenceLate?: boolean | null;
} = {}) {
  const now = Date.now();
  return {
    classId,
    classTitle: "Synthetic absence class",
    classNumber: 701,
    classKind: "cohort",
    sessionId,
    sequenceNumber: 1,
    sessionTitle: "Absence workflow session",
    startAt: new Date(now - 60_000).toISOString(),
    endAt: new Date(now + 60 * 60_000).toISOString(),
    mode: "online",
    state,
    tutorId: roleTutorId,
    absenceReportedAt,
    absenceLate,
    report,
    settlement: null,
  };
}

async function mockSessionReports(
  page: Page,
  options: {
    role?: "tutor" | "admin" | "student";
    row?: ReturnType<typeof reportRow>;
  } = {},
) {
  const role = options.role ?? "tutor";
  const calls: { path: string; body: unknown }[] = [];
  const errors: string[] = [];
  let currentRow = options.row ?? reportRow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://localhost:3356") return route.continue();
    if (url.origin !== "http://localhost:3357") {
      errors.push(`Unexpected origin: ${url.origin}`);
      return route.abort();
    }
    const procedure = url.pathname;
    let body: { json?: Record<string, unknown> } = {};
    try {
      const parsed = route.request().postDataJSON();
      if (parsed && typeof parsed === "object") body = parsed as typeof body;
    } catch {
      // Auth and read calls may not have JSON request bodies.
    }
    calls.push({ path: procedure, body: body.json });
    const user = {
      id: role === "tutor" ? tutorId : `${role}-absence-user`,
      name: role === "tutor" ? "Synthetic Tutor" : `Synthetic ${role}`,
      email: `${role}@absence.example.test`,
      role,
      emailVerified: true,
      image: null,
    };
    if (procedure.includes("/api/auth/")) {
      return route.fulfill({
        json: {
          user,
          session: {
            id: "synthetic-absence-session",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    }
    let data: unknown = [];
    if (procedure.includes("notification/")) data = { items: [], count: 0 };
    else if (procedure.endsWith("listSessionReports")) data = [currentRow];
    else if (procedure.endsWith("listReportSessions")) data = [];
    else if (procedure.endsWith("reportTutorAbsence")) {
      const reportedAt = new Date().toISOString();
      currentRow = {
        ...currentRow,
        absenceReportedAt: reportedAt,
        absenceLate: true,
      };
      data = {
        sessionId,
        tutorId,
        reportedAt,
        scheduledStartAt: currentRow.startAt,
        late: true,
      };
    } else if (procedure.endsWith("getProfile")) data = user;
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  return { calls, errors };
}

for (const width of [390, 1440]) {
  test(`tutor can report absence after session start at ${width}px`, async ({
    page,
  }) => {
    const { calls, errors } = await mockSessionReports(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/class-reports?workspace=sessions");
    const row = page.getByTestId(`session-report-row-${sessionId}`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Record report/ }).click();

    await expect(
      page.getByText("Report tutor absence", { exact: true }),
    ).toBeVisible();
    // The mocked session started one minute ago and remains scheduled.
    await page
      .getByRole("textbox", { name: "Reason" })
      .fill("Unexpected illness after the session started");
    await page.getByRole("button", { name: "Report absence" }).click();

    await expect(
      page.getByRole("heading", { name: "Absence notice recorded" }),
    ).toBeVisible();
    const absenceStatus = page
      .getByRole("status")
      .filter({ hasText: "Tutor absence notice recorded · Late notice" });
    await expect(absenceStatus).toBeVisible();
    await expect(absenceStatus).toContainText(/\d{1,2}:\d{2}/);
    const reportCall = calls.find((call) =>
      call.path.endsWith("reportTutorAbsence"),
    );
    expect(reportCall?.body).toMatchObject({
      sessionId,
      reason: "Unexpected illness after the session started",
    });
    expect(reportCall?.body).toMatchObject({ requestKey: expect.any(String) });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
}

test("non-owner and terminal session states do not expose absence reporting", async ({
  page,
}) => {
  const { errors } = await mockSessionReports(page, {
    role: "tutor",
    row: reportRow({ roleTutorId: otherTutorId }),
  });
  await page.goto("/class-reports?workspace=sessions");
  const row = page.getByTestId(`session-report-row-${sessionId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Record report/ }).click();
  await expect(
    page.getByText("Report tutor absence", { exact: true }),
  ).toHaveCount(0);

  await page.unrouteAll();
  await mockSessionReports(page, {
    role: "tutor",
    row: reportRow({
      state: "completed",
      report: {
        id: "a3f9cbda-124c-4c9e-b272-141b65c4e411",
        sessionId,
        version: 1,
        discussion: ["Completed session"],
        strengths: ["Clear examples"],
        improvements: ["Keep practicing"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }),
  });
  await page.goto("/class-reports?workspace=sessions");
  const completedRow = page.getByTestId(`session-report-row-${sessionId}`);
  await expect(completedRow).toBeVisible();
  await completedRow
    .getByRole("button", { name: /View report|Edit report/ })
    .click();
  await expect(
    page.getByText("Report tutor absence", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("students do not get tutor absence controls", async ({ page }) => {
  const { errors } = await mockSessionReports(page, { role: "student" });
  await page.goto("/class-reports");
  await expect(
    page.getByRole("heading", { name: "Follow up on learning progress" }),
  ).toBeVisible();
  await expect(
    page.getByText("Report tutor absence", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("admin sees absence history and replaces the tutor without changing the session time", async ({
  page,
}) => {
  const errors: string[] = [];
  const calls: { path: string; body: unknown }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const startAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const endAt = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
  const originalTutorId = "tutor-absence-owner";
  const replacementTutorId = "tutor-valid-replacement";
  const reportedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const record: Record<string, any> = {
    id: classId,
    version: 4,
    kind: "cohort",
    state: "published",
    competitionId: "93d0a0c4-6194-4eaf-9060-af45c26b536a",
    titleEn: "Synthetic absence class",
    titleId: null,
    descriptionEn: "A synthetic class for browser acceptance.",
    descriptionId: null,
    coverKey: null,
    tutorFeeIdr: 400_000,
    minimumEnrollment: 1,
    minimumCheckAt: null,
    cohortFullRateMarks: 20,
    cohortHalfRateMarks: 22,
    cohortSingleRateMarks: 25,
    masterclassRateMarks: null,
    createdAt: new Date().toISOString(),
    competition: {
      id: "93d0a0c4-6194-4eaf-9060-af45c26b536a",
      name: "Synthetic competition",
      parent: null,
    },
    sessions: [
      {
        id: sessionId,
        classId,
        sequenceNumber: 1,
        capacity: 10,
        titleEn: "Absence workflow session",
        titleId: null,
        curriculumEn: "Practice session.",
        curriculumId: null,
        startAt,
        endAt,
        mode: "online",
        roomId: null,
        tutorFeeIdr: 400_000,
        tutorId: originalTutorId,
        tutor: { id: originalTutorId, name: "Synthetic Tutor" },
        room: null,
        meeting: { status: "created" },
        state: "scheduled",
        version: 7,
        tutorAbsences: [
          {
            id: "absence-record-1",
            sessionId,
            tutorId: originalTutorId,
            requestKey: "5faea4fb-d537-4f55-9bb9-b8fef482d988",
            reason: "Unexpected illness after the session started",
            reportedAt,
            scheduledStartAt: startAt,
            late: true,
            tutorLateNoticeCount: 2,
            tutor: { id: originalTutorId, name: "Synthetic Tutor" },
          },
        ],
      },
    ],
  };
  const user = {
    id: "admin-absence-user",
    name: "Synthetic Admin",
    email: "admin@absence.example.test",
    role: "admin",
    emailVerified: true,
    image: null,
  };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://localhost:3356") return route.continue();
    if (url.origin !== "http://localhost:3357") {
      errors.push(`Unexpected origin: ${url.origin}`);
      return route.abort();
    }
    const procedure = url.pathname;
    let body: { json?: Record<string, unknown> } = {};
    try {
      const parsed = route.request().postDataJSON();
      if (parsed && typeof parsed === "object") body = parsed as typeof body;
    } catch {
      // Auth and read calls may not have JSON request bodies.
    }
    calls.push({ path: procedure, body: body.json });
    let data: unknown = [];
    if (procedure.includes("/api/auth/")) {
      return route.fulfill({
        json: {
          user,
          session: {
            id: "synthetic-admin-session",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    }
    if (procedure.includes("notification/")) {
      data = { items: [], count: 0 };
    } else if (procedure.endsWith("listAcademyClasses")) {
      const state = body.json?.state;
      data = state === "published" ? [record] : [];
    } else if (procedure.endsWith("listTutorProfiles")) {
      data = [
        {
          userId: originalTutorId,
          user: { id: originalTutorId, name: "Synthetic Tutor", role: "tutor" },
        },
        {
          userId: replacementTutorId,
          user: {
            id: replacementTutorId,
            name: "Replacement Tutor",
            role: "tutor",
          },
        },
      ];
    } else if (procedure.endsWith("listCompetitionCatalog")) data = [];
    else if (procedure.endsWith("replaceAbsentClassTutor")) {
      const requestBody = body.json ?? {};
      record.sessions[0].tutorId = String(requestBody.replacementTutorId);
      record.sessions[0].tutor = {
        id: String(requestBody.replacementTutorId),
        name: "Replacement Tutor",
      };
      record.sessions[0].version += 1;
      data = record;
    }
    return route.fulfill({ json: { json: data, meta: [] } });
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin-classes");
  const card = page.getByTestId(`published-class-${classId}`);
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("region", { name: "Tutor absence notices" }),
  ).toContainText("Tutor absence history (1)");
  await expect(card).toContainText("2 late notice(s) for this tutor");
  const replacement = card.getByRole("combobox", { name: "Replacement tutor" });
  await replacement.click();
  await page.getByRole("option", { name: "Replacement Tutor" }).click();
  await card
    .getByRole("textbox", { name: "Admin reason" })
    .fill("Cover the session while keeping its published schedule");
  await card.getByRole("button", { name: "Replace tutor" }).click();

  await expect(page.getByText("Tutor replaced")).toBeVisible();
  const replaceCall = calls.find((call) =>
    call.path.endsWith("replaceAbsentClassTutor"),
  );
  expect(replaceCall?.body).toEqual({
    sessionId,
    expectedVersion: 7,
    replacementTutorId,
    reason: "Cover the session while keeping its published schedule",
  });
  expect(record.sessions[0]).toMatchObject({ startAt, endAt, version: 8 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});
