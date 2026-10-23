import { randomUUID } from "node:crypto";
import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
} from "../fixtures/test-accounts";
import { resetE2eAuthRateLimit } from "../fixtures/auth-rate-limit";

async function fillDateTime(page: Page, id: string, date: Date) {
  await page.locator(`#${id}`).click();
  const calendar = page.getByRole("dialog").last();
  await calendar.getByRole("combobox", { name: "Choose the Year" }).click();
  await page
    .getByRole("option", { name: String(date.getFullYear()), exact: true })
    .click();
  await calendar.getByRole("combobox", { name: "Choose the Month" }).click();
  await page
    .getByRole("option", {
      name: date.toLocaleString("en-US", { month: "long" }),
      exact: true,
    })
    .click();
  await calendar
    .locator("button[aria-label]")
    .filter({ hasText: new RegExp(`^${date.getDate()}$`) })
    .click();
  await page.locator(`#${id}-time`).fill(toDateTimeLocal(date).split("T")[1]!);
}

type AdminClassSession = {
  id: string;
  capacity: number;
  titleEn: string;
  titleId: string | null;
  curriculumEn: string | null;
  curriculumId: string | null;
  startAt: string;
  endAt: string;
  mode: "online" | "in_person";
  roomId: string | null;
  tutorId: string;
  tutorFeeIdr: number;
  meeting?: { status: string } | null;
};

type AdminClass = {
  id: string;
  version: number;
  state: string;
  kind: "cohort" | "masterclass";
  competitionId: string;
  titleEn: string;
  titleId: string | null;
  descriptionEn: string;
  descriptionId: string | null;
  coverKey: string | null;
  minimumEnrollment: number | null;
  minimumCheckAt: string | null;
  cohortFullRateMarks: number | null;
  cohortHalfRateMarks: number | null;
  cohortSingleRateMarks: number | null;
  masterclassRateMarks: number | null;
  tutorFeeIdr: number;
  sessions: AdminClassSession[];
};

function assertDedicatedTestDatabase() {
  let databaseUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL)
      databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    databaseUrl?.pathname.replace(/^\/+/, "").toLowerCase() !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase() ?? "",
    )
  ) {
    throw new Error(
      "Class browser coverage requires NODE_ENV=test and the local cogito-test database.",
    );
  }
}

function toDateTimeLocal(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

async function createApiContext(email: string, password: string) {
  resetE2eAuthRateLimit();
  const context = await request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3101",
  });
  const response = await context.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  if (!response.ok()) {
    await context.dispose();
    throw new Error(`API sign-in returned ${response.status()}`);
  }
  return context;
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
    throw new Error(
      `${procedure} returned ${response.status()}: ${await response.text()}`,
    );
  }
  return ((await response.json()) as { json: T }).json;
}

async function ensureManagedRoom(adminApi: APIRequestContext) {
  const existing = await rpc<{ id: string; capacity: number }[]>(
    adminApi,
    "room/list",
    { limit: 100, offset: 0 },
  );
  const available = existing.find((candidate) => candidate.capacity >= 4);
  if (available) return available.id;
  const created = await rpc<{ id: string }>(adminApi, "room/create", {
    name: `E2E managed room ${randomUUID().slice(0, 8)}`,
    location: "Dedicated test database",
    capacity: 4,
  });
  return created.id;
}

test("admin publishes both class modes; students see only the published DTO", async ({
  page,
  browser,
}) => {
  assertDedicatedTestDatabase();
  const suffix = randomUUID().slice(0, 8);
  const title = `E2E RETRY: class ${suffix}`;
  const scheduleOffsetDays = Number.parseInt(suffix, 16) % 365;
  const firstStart = new Date(2045, 0, 1 + scheduleOffsetDays, 10);
  const firstEnd = new Date(firstStart.getTime() + 60 * 60 * 1000);
  const secondStart = new Date(firstStart);
  secondStart.setDate(secondStart.getDate() + 7);
  const secondEnd = new Date(secondStart.getTime() + 60 * 60 * 1000);
  const minimumCheckAt = new Date(firstStart);
  minimumCheckAt.setDate(minimumCheckAt.getDate() - 1);
  const adminApi = await createApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  const studentApi = await createApiContext(STUDENT_EMAIL, STUDENT_PASSWORD);
  await ensureManagedRoom(adminApi);
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    await page.route("**/rpc/classes/list", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ json: null, meta: [] }),
      }),
    );
    await page.goto("/classes");
    await expect(
      page.getByRole("heading", { name: "Classes unavailable" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.unroute("**/rpc/classes/list");

    await page.route("**/rpc/classes/list", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ json: [], meta: [] }),
      }),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "New classes are on the way" }),
    ).toBeVisible();
    await page.unroute("**/rpc/classes/list");

    adminContext = await browser.newContext({
      storageState: await adminApi.storageState(),
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin-classes");
    await adminPage.getByRole("tab", { name: "Drafts & editor" }).click();
    await expect(
      adminPage.getByRole("heading", { name: "Class studio" }),
    ).toBeVisible();

    for (const width of [390, 1024, 1440]) {
      // eslint-disable-next-line no-await-in-loop -- Measurements share one page and must follow each resize.
      await adminPage.setViewportSize({ width, height: 1000 });
      // eslint-disable-next-line no-await-in-loop -- Assert this viewport before resizing again.
      await expect
        .poll(async () =>
          adminPage.evaluate(() => {
            const context = document.createElement("canvas").getContext("2d")!;
            return [
              "class-full-rate",
              "class-half-rate",
              "class-single-rate",
            ].filter((id) => {
              const input = document.getElementById(id) as HTMLInputElement;
              const style = getComputedStyle(input);
              context.font = style.font;
              const available =
                input.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight);
              return available + 1 < context.measureText(input.value).width;
            });
          }),
        )
        .toEqual([]);
    }

    // The browser rejects an incomplete draft before making a save request.
    await adminPage.getByRole("button", { name: "Save draft" }).click();
    await expect(adminPage.locator("#class-title-en")).toBeFocused();

    await adminPage.locator("#class-competition").click();
    await adminPage.getByRole("option").first().click();
    await adminPage.getByLabel("Title (English)", { exact: true }).fill(title);
    await adminPage
      .getByLabel("Description (English)", { exact: true })
      .fill("Automated test fixture. Not approved class copy.");
    await expect(adminPage.locator("#class-tutor-fee")).toHaveValue("400000");
    await expect(adminPage.locator("#class-tutor-fee")).toHaveAttribute(
      "readonly",
      "",
    );
    await fillDateTime(adminPage, "class-minimum-check-at", minimumCheckAt);
    await adminPage.locator("#class-minimum-enrollment").fill("2");

    await adminPage
      .getByLabel("Session title (English)")
      .nth(0)
      .fill("Online fixture session");
    await adminPage
      .getByLabel("Curriculum description (English)")
      .nth(0)
      .fill("Automated test curriculum fixture.");
    await fillDateTime(adminPage, "session-0-start", firstStart);
    await fillDateTime(adminPage, "session-0-end", firstEnd);
    await adminPage.locator("#session-0-capacity").fill("4");
    await adminPage.locator("#session-0-tutor").click();
    await adminPage.getByRole("option").first().click();

    await adminPage.getByRole("button", { name: "Add session" }).click();
    await adminPage
      .getByLabel("Session title (English)")
      .nth(1)
      .fill("In-person fixture session");
    await adminPage
      .getByLabel("Curriculum description (English)")
      .nth(1)
      .fill("Automated test curriculum fixture.");
    await fillDateTime(adminPage, "session-1-start", secondStart);
    await fillDateTime(adminPage, "session-1-end", secondEnd);
    await adminPage.locator("#session-1-capacity").fill("4");
    await adminPage.locator("#session-1-mode").click();
    await adminPage.getByRole("option", { name: "In person" }).click();
    await adminPage.locator("#session-1-tutor").click();
    await adminPage.getByRole("option").first().click();
    await adminPage.locator("#session-1-room").click();
    await adminPage.getByRole("option").first().click();
    await adminPage
      .getByLabel("Reason for this change")
      .fill("Create a synthetic class E2E fixture");
    await adminPage.getByRole("button", { name: "Save draft" }).click();
    await expect(adminPage.getByText("Class draft saved")).toBeVisible();

    const drafts = await rpc<AdminClass[]>(
      adminApi,
      "admin/listAcademyClasses",
      { state: "draft" },
    );
    const draft = drafts.find((record) => record.titleEn === title);
    if (!draft) throw new Error("The UI-created class draft was not returned");
    expect(draft.tutorFeeIdr).toBe(400_000);
    expect(draft.sessions.map((session) => session.mode)).toEqual([
      "online",
      "in_person",
    ]);

    const hiddenRead = await studentApi.post("/rpc/classes/get", {
      data: { json: { id: draft.id } },
    });
    expect(hiddenRead.status()).toBe(404);
    const adminBypass = await studentApi.post(
      "/rpc/admin/publishAcademyClass",
      {
        data: {
          json: {
            id: draft.id,
            expectedVersion: draft.version,
            reason: "Student must not publish classes",
          },
        },
      },
    );
    expect(adminBypass.ok()).toBe(false);

    // Another admin saves first; the stale browser edit must be rejected.
    await rpc<AdminClass>(adminApi, "admin/saveAcademyClassDraft", {
      id: draft.id,
      expectedVersion: draft.version,
      kind: "cohort",
      competitionId: draft.competitionId,
      titleEn: draft.titleEn,
      titleId: draft.titleId,
      descriptionEn: "External reviewer update to the synthetic fixture.",
      descriptionId: draft.descriptionId,
      coverKey: draft.coverKey,
      tutorFeeIdr: draft.tutorFeeIdr,
      minimumEnrollment: draft.minimumEnrollment,
      minimumCheckAt: draft.minimumCheckAt,
      fullRateMarks: draft.cohortFullRateMarks,
      halfRateMarks: draft.cohortHalfRateMarks,
      singleRateMarks: draft.cohortSingleRateMarks,
      reason: "Simulate a concurrent admin draft update",
      sessions: draft.sessions.map((session) => ({
        id: session.id,
        capacity: session.capacity,
        titleEn: session.titleEn,
        titleId: session.titleId,
        curriculumEn: session.curriculumEn,
        curriculumId: session.curriculumId,
        startAt: session.startAt,
        endAt: session.endAt,
        mode: session.mode,
        roomId: session.roomId,
        tutorId: session.tutorId,
      })),
    });
    await adminPage
      .getByLabel("Title (English)", { exact: true })
      .fill(`${title} stale`);
    await adminPage
      .getByLabel("Reason for this change")
      .fill("Attempt a stale save after a concurrent admin update");
    await adminPage.getByRole("button", { name: "Save draft" }).click();
    await expect(
      adminPage.getByText(/changed in another admin session/),
    ).toBeVisible();
    const afterStaleSave = await rpc<AdminClass>(
      adminApi,
      "admin/getAcademyClass",
      {
        id: draft.id,
      },
    );
    expect(afterStaleSave.titleEn).toBe(title);
    expect(afterStaleSave.descriptionEn).toContain("External reviewer update");

    await adminPage.reload();
    await adminPage.getByRole("button", { name: `Edit ${title}` }).click();
    await adminPage
      .getByLabel("Reason for this change")
      .fill("Publish the reviewed synthetic class fixture");
    await adminPage.getByRole("button", { name: "Publish class" }).click();
    await expect(adminPage.getByText("Class published")).toBeVisible();
    const publishedCard = adminPage
      .getByText(title, { exact: true })
      .locator("xpath=../../../..");
    await expect(
      publishedCard.getByText(/0 Meet\(s\) ready.*1 failed/),
    ).toBeVisible();

    const retryReason = publishedCard.locator(`#meeting-retry-${draft.id}`);
    await retryReason.fill("Retry the accepted event with a pending Meet link");
    await publishedCard
      .getByRole("button", { name: "Retry failed meeting setup" })
      .click();
    await expect(publishedCard.getByText(/1 Meet\(s\) ready/)).toBeVisible();

    const publishedRecord = await rpc<AdminClass>(
      adminApi,
      "admin/getAcademyClass",
      { id: draft.id },
    );
    expect(publishedRecord.sessions[0]?.meeting?.status).toBe("created");
    expect(publishedRecord.sessions[1]?.meeting).toBeNull();

    await page.reload();
    const publicClassLink = page
      .getByRole("heading", { level: 3, name: title })
      .locator("xpath=..");
    await expect(publicClassLink).toBeVisible();
    await publicClassLink.click();
    await expect(page).toHaveURL(new RegExp(`/classes/${draft.id}$`));
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Curriculum and schedule" }),
    ).toBeVisible();
    await expect(page.getByText("Online fixture session")).toBeVisible();
    await expect(page.getByText("In-person fixture session")).toBeVisible();
    await expect(
      page.getByText(/Enrollment will open when registration is ready/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /enroll/i })).toHaveCount(0);

    const publicRecord = await rpc<Record<string, unknown>>(
      studentApi,
      "classes/get",
      { id: draft.id },
    );
    expect(publicRecord.state).toBe("published");
    expect(publicRecord).not.toHaveProperty("tutorFeeIdr");
    const publicSessions = publicRecord.sessions as Record<string, unknown>[];
    expect(publicSessions).toHaveLength(2);
    for (const session of publicSessions) {
      expect(session).not.toHaveProperty("tutorId");
      expect(session).not.toHaveProperty("roomId");
      expect(session).not.toHaveProperty("meeting");
    }

    await page.goto(`/classes/${randomUUID()}`);
    await expect(
      page.getByRole("heading", { name: "Class unavailable" }),
    ).toBeVisible();
  } finally {
    await adminContext?.close();
    await studentApi.dispose();
    await adminApi.dispose();
  }
});
