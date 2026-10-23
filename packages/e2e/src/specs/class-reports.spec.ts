import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  T07_CLASS_REPORTS_STUDENT_EMAIL,
  TUTOR_EMAIL,
} from "../fixtures/test-accounts";
import { resolveE2eEnvFile } from "../fixtures/e2e-environment";

type TestClass = {
  id: string;
  version: number;
  state: string;
  sessions: { id: string; sequenceNumber: number }[];
};

type SessionReportRow = {
  classId: string;
  sessionId: string;
  state: string;
  report: {
    id: string;
    version: number;
    discussion: string[];
    strengths: string[];
    improvements: string[];
  } | null;
  settlement: {
    deductedMarks: number;
    tutorFeeIdr: number;
    settled: boolean;
  } | null;
};

function assertT05EnrollmentTarget() {
  const dbUrl = new URL(process.env.DATABASE_URL ?? "");
  const redisUrl = new URL(process.env.REDIS_URL ?? "");
  const serverUrl = new URL(process.env.SERVER_URL ?? "");
  const webUrl = new URL(process.env.WEB_URL ?? "");
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.T07_CLASS_REPORTS_E2E !== "1" ||
    process.env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
    process.env.T05_ENROLLMENT_TEST_REDIS_PORT !== "6381" ||
    process.env.T05_ENROLLMENT_TEST_SERVER_PORT !== "3201" ||
    process.env.T05_ENROLLMENT_TEST_WEB_PORT !== "3200" ||
    !["postgres:", "postgresql:"].includes(dbUrl.protocol) ||
    !loopback.has(dbUrl.hostname.toLowerCase()) ||
    dbUrl.port !== "6769" ||
    dbUrl.pathname !== "/cogito-test" ||
    redisUrl.protocol !== "redis:" ||
    !loopback.has(redisUrl.hostname.toLowerCase()) ||
    redisUrl.port !== "6381" ||
    serverUrl.protocol !== "http:" ||
    !loopback.has(serverUrl.hostname.toLowerCase()) ||
    serverUrl.port !== "3201" ||
    webUrl.protocol !== "http:" ||
    !loopback.has(webUrl.hostname.toLowerCase()) ||
    webUrl.port !== "3200"
  ) {
    throw new Error(
      "Class report E2E requires its opt-in setup and configured loopback T05 targets.",
    );
  }
}

async function createApiContext(
  role: "admin" | "student" | "tutor",
  stateName: string = role,
) {
  return request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3201",
    storageState: path.resolve(process.cwd(), ".auth", `${stateName}.json`),
  });
}

async function rpc<T>(
  context: APIRequestContext,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await context.post(`/rpc/${procedure}`, {
    data: { json: input },
  });
  if (!response.ok()) {
    throw new Error(`${procedure} returned ${response.status()}`);
  }
  return ((await response.json()) as { json: T }).json;
}

async function createPublishedReportClass(
  adminApi: APIRequestContext,
  references: { competitionId: string; tutorId: string },
  title: string,
  scheduleOffsetDays: number,
): Promise<TestClass> {
  const startAt = new Date(Date.UTC(2045, 0, 1 + scheduleOffsetDays, 10));
  const draft = await rpc<TestClass>(adminApi, "admin/saveAcademyClassDraft", {
    kind: "cohort",
    competitionId: references.competitionId,
    titleEn: title,
    titleId: null,
    descriptionEn: "Synthetic class for the T07 report browser journey.",
    descriptionId: null,
    coverKey: null,
    tutorFeeIdr: 400_000,
    reason: "Create a private class report E2E fixture",
    minimumEnrollment: 1,
    minimumCheckAt: new Date(startAt.getTime() - 7 * 86_400_000).toISOString(),
    fullRateMarks: 20,
    halfRateMarks: 22,
    singleRateMarks: 25,
    sessions: [
      {
        capacity: 4,
        titleEn: "Report journey session",
        titleId: null,
        curriculumEn: "Synthetic report journey lesson.",
        curriculumId: null,
        startAt: startAt.toISOString(),
        endAt: new Date(startAt.getTime() + 60 * 60_000).toISOString(),
        mode: "online",
        roomId: null,
        tutorId: references.tutorId,
      },
    ],
  });
  return rpc<TestClass>(adminApi, "admin/publishAcademyClass", {
    id: draft.id,
    expectedVersion: draft.version,
    reason: "Publish the private class report E2E fixture",
  });
}

function moveFixtureSessionPast(classId: string, sessionId: string) {
  const serverDir = path.resolve(process.cwd(), "../../apps/server");
  const selectedEnvFile = resolveE2eEnvFile(process.cwd(), process.env);
  execFileSync(
    "bun",
    [
      `--env-file=${selectedEnvFile}`,
      "run",
      "src/seed/move-t07-report-session-past.ts",
      classId,
      sessionId,
    ],
    { cwd: serverDir, env: process.env, stdio: "pipe" },
  );
}

async function reportRows(api: APIRequestContext) {
  return rpc<SessionReportRow[]>(api, "classes/listSessionReports", {});
}

async function openSession(page: Page, sessionId: string) {
  const row = page.getByTestId(`session-report-row-${sessionId}`);
  await expect(row).toBeVisible();
  const selectButton = row.getByRole("button");
  if ((await selectButton.getAttribute("aria-pressed")) !== "true") {
    await selectButton.click();
  }
  return row;
}

test("tutor records, admin corrects, and student reads a real class session report", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  assertT05EnrollmentTarget();
  if (!T07_CLASS_REPORTS_STUDENT_EMAIL) {
    throw new Error("Missing isolated T07 class-report student fixture.");
  }
  const adminApi = await createApiContext("admin");
  const studentApi = await createApiContext("student", "t07-report-student");
  const tutorApi = await createApiContext("tutor");
  let tutorContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let studentContext:
    | Awaited<ReturnType<typeof browser.newContext>>
    | undefined;

  try {
    const competitions = await rpc<
      { id: string; isActive: boolean; parentId: string | null }[]
    >(adminApi, "admin/listCompetitionCatalog", { includeArchived: false });
    const competition = competitions.find(
      (row) => row.isActive && !row.parentId,
    );
    const tutors = await rpc<
      { user: { id: string; role: string; email: string } }[]
    >(adminApi, "adminTutor/listTutorProfiles", {
      status: "published",
      limit: 100,
      offset: 0,
    });
    const tutor = tutors.find(
      (row) =>
        row.user.role === "tutor" &&
        row.user.email.toLowerCase() === TUTOR_EMAIL.toLowerCase(),
    );
    if (!competition || !tutor) {
      throw new Error(
        "T07 report E2E requires the seeded tutor and competition.",
      );
    }

    const suffix = randomUUID().slice(0, 8);
    const academyClass = await createPublishedReportClass(
      adminApi,
      { competitionId: competition.id, tutorId: tutor.user.id },
      `T07 report E2E ${suffix}`,
      Number.parseInt(suffix, 16) % 100_000,
    );
    const sessionId = academyClass.sessions[0]?.id;
    if (!sessionId) throw new Error("The T07 class did not publish a session.");

    const enrollment = await rpc<{ outcome: string }>(
      studentApi,
      "classes/createEnrollment",
      {
        classId: academyClass.id,
        plan: "single",
        sessionId,
        requestKey: randomUUID(),
      },
    );
    expect(enrollment.outcome).toBe("confirmed");
    const walletBeforeReport = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});

    moveFixtureSessionPast(academyClass.id, sessionId);
    const tutorPending = (await reportRows(tutorApi)).find(
      (row) => row.sessionId === sessionId,
    );
    expect(tutorPending).toMatchObject({
      classId: academyClass.id,
      state: "scheduled",
      report: null,
      settlement: { deductedMarks: 25, tutorFeeIdr: 400_000, settled: false },
    });

    tutorContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await tutorApi.storageState(),
    });
    const tutorPage = await tutorContext.newPage();
    await tutorPage.goto("/class-reports");
    await openSession(tutorPage, sessionId);
    await tutorPage
      .getByRole("textbox", { name: "Session discussion" })
      .fill("• Reviewed a structured opening argument");
    await tutorPage
      .getByRole("textbox", { name: "Strengths observed" })
      .fill("• Used evidence to support each claim");
    await tutorPage
      .getByRole("textbox", { name: "Areas for improvement" })
      .fill("• Practise concise rebuttals");
    await tutorPage
      .getByRole("checkbox", { name: "I confirm this session was delivered." })
      .check();
    await tutorPage.getByRole("button", { name: "Record report" }).click();
    await expect(tutorPage.getByText("Recorded settlement")).toBeVisible();
    await expect(
      tutorPage.getByText(/25 Marks deducted\s+·\s+Tutor fee Rp\s*400\.000/),
    ).toBeVisible();
    await expect(
      tutorPage.getByRole("textbox", { name: "Session discussion" }),
    ).toHaveValue("• Reviewed a structured opening argument");

    const firstReport = (await reportRows(tutorApi)).find(
      (row) => row.sessionId === sessionId,
    );
    expect(firstReport).toMatchObject({
      report: { version: 1 },
      settlement: { deductedMarks: 25, tutorFeeIdr: 400_000, settled: true },
    });
    const walletAfterFirstReport = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    expect(walletAfterFirstReport.totalBalance).toBe(
      walletBeforeReport.totalBalance - 25,
    );
    expect(walletAfterFirstReport.heldBalance).toBe(
      walletBeforeReport.heldBalance - 25,
    );
    expect(walletAfterFirstReport.availableBalance).toBe(
      walletBeforeReport.availableBalance,
    );

    adminContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await adminApi.storageState(),
    });
    try {
      const adminPage = await adminContext.newPage();
      await adminPage.goto("/class-reports");
      await openSession(adminPage, sessionId);
      await adminPage
        .getByRole("textbox", { name: "Areas for improvement" })
        .fill("• Add one worked example to the next lesson");
      await adminPage
        .getByRole("checkbox", {
          name: "I confirm this session was delivered.",
        })
        .check();
      await adminPage.getByRole("button", { name: "Save correction" }).click();
      await expect(
        adminPage.getByText("Enter a reason with at least 3 characters."),
      ).toBeVisible();
      await adminPage
        .getByRole("textbox", { name: "Correction reason" })
        .fill("Clarify the next lesson plan");
      await adminPage.getByRole("button", { name: "Save correction" }).click();
      await expect(
        adminPage.getByText("Version 2", { exact: true }),
      ).toBeVisible();
    } finally {
      await adminContext.close();
      adminContext = undefined;
    }

    await tutorPage
      .getByRole("textbox", { name: "Areas for improvement" })
      .fill("• Rework my example after reviewing the class notes");
    await tutorPage
      .getByRole("checkbox", { name: "I confirm this session was delivered." })
      .check();
    await tutorPage.getByRole("button", { name: "Save correction" }).click();
    await expect(
      tutorPage.getByText("A newer report version was loaded"),
    ).toBeVisible();
    await expect(
      tutorPage.getByRole("textbox", { name: "Areas for improvement" }),
    ).toHaveValue("• Rework my example after reviewing the class notes");
    await tutorPage
      .getByRole("button", { name: "Use my draft over version 2" })
      .click();
    await tutorPage.getByRole("button", { name: "Save correction" }).click();
    await expect(tutorPage.getByText("Version 3")).toBeVisible();

    const finalReport = (await reportRows(tutorApi)).find(
      (row) => row.sessionId === sessionId,
    );
    expect(finalReport).toMatchObject({
      report: {
        version: 3,
        improvements: ["Rework my example after reviewing the class notes"],
      },
      settlement: { deductedMarks: 25, tutorFeeIdr: 400_000, settled: true },
    });
    const walletAfterCorrections = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    expect(walletAfterCorrections).toEqual(walletAfterFirstReport);

    await tutorContext.close();
    tutorContext = undefined;

    studentContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await studentApi.storageState(),
    });
    try {
      const studentPage = await studentContext.newPage();
      await studentPage.goto("/class-reports");
      const studentRow = studentPage.getByTestId(
        `session-report-row-${sessionId}`,
      );
      await expect(studentRow).toBeVisible();
      await studentRow.getByRole("button", { name: "View report" }).click();
      await expect(
        studentPage.getByText(
          "Rework my example after reviewing the class notes",
        ),
      ).toBeVisible();
      const studentReports = await reportRows(studentApi);
      expect(studentReports).toHaveLength(1);
      expect(studentReports[0]?.sessionId).toBe(sessionId);
      expect(studentReports[0]?.settlement).toBeNull();
    } finally {
      await studentContext.close();
      studentContext = undefined;
    }
  } finally {
    await Promise.allSettled([
      studentContext?.close(),
      adminContext?.close(),
      tutorContext?.close(),
      studentApi.dispose(),
      tutorApi.dispose(),
      adminApi.dispose(),
    ]);
  }
});
