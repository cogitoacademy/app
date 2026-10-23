import { expect, test, type Page } from "@playwright/test";

const classId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const future = new Date(Date.now() + 14 * 86400000).toISOString();
const futureEnd = new Date(Date.now() + 14 * 86400000 + 5400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
const pastEnd = new Date(Date.now() - 86400000 + 5400000).toISOString();
const competition = {
  id: "competition-fixture",
  name: "Mathematics",
  parent: { name: "National Olympiad" },
};
const cohort = {
  id: classId,
  version: 1,
  kind: "cohort",
  state: "published",
  titleEn: "Olympiad problem solving: algebra and number theory",
  titleId: "Kelas Olimpiade",
  descriptionEn:
    "Build a confident approach to challenging competition problems with guided practice, discussion, and feedback.",
  competition,
  competitionId: competition.id,
  coverKey: null,
  cohortFullRateMarks: 20,
  cohortHalfRateMarks: 22,
  cohortSingleRateMarks: 25,
  masterclassRateMarks: null,
  minimumCheckAt: null,
  postponementCount: 0,
  freeExitUntil: null,
  sessions: [
    {
      id: sessionId,
      sequenceNumber: 1,
      titleEn: "Patterns, proofs, and problem-solving strategies",
      curriculumEn: "Explore number patterns and explain each step of a proof.",
      startAt: future,
      endAt: futureEnd,
      mode: "online",
      capacity: 20,
      state: "scheduled",
      version: 1,
      tutor: { name: "Alexandra Putri" },
      meeting: { status: "created" },
    },
  ],
};
const masterclass = {
  ...cohort,
  id: "33333333-3333-4333-8333-333333333333",
  kind: "masterclass",
  titleEn: "Debate fundamentals",
  competition: { ...competition, name: "Debate" },
  masterclassRateMarks: 30,
};

async function mockClasses(page: Page, role: "student" | "tutor" | "admin") {
  const user = {
    id: "class-ui-fixture",
    name: "Class UI",
    email: "class-ui@example.test",
    emailVerified: true,
    image: null,
    role,
    createdAt: past,
    updatedAt: past,
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user,
        session: {
          id: "ui-session",
          userId: user.id,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    }),
  );
  await page.route("**/rpc/**", (route) => {
    const url = new URL(route.request().url());
    const procedure = url.pathname.replace("/rpc/", "");
    const encoded = url.searchParams.get("data");
    const body =
      route.request().postDataJSON() ?? (encoded ? JSON.parse(encoded) : {});
    const input = body?.json ?? {};
    let data: unknown = [];
    if (procedure === "admin/searchUsers")
      data = [
        {
          id: "export-student",
          name: "Export Student",
          email: "export@example.test",
          role: "student",
        },
      ];
    else if (procedure === "classes/list") data = [cohort, masterclass];
    else if (procedure === "classes/get") data = cohort;
    else if (procedure === "classes/getMyEnrollments")
      data = {
        classId,
        classState: "published",
        freeExitUntil: null,
        enrollments: [],
        eligibleSessions: [
          {
            sessionId,
            sequenceNumber: 1,
            startAt: future,
            capacity: 20,
            seatsAvailable: 12,
            alreadyEntitled: false,
          },
        ],
      };
    else if (procedure === "classes/listSessionReports")
      data = Array.from({ length: 8 }, (_, index) => ({
        classId,
        classTitle: cohort.titleEn,
        classKind: "cohort",
        sessionId: `session-${index}`,
        sequenceNumber: index + 1,
        sessionTitle: `Problem solving workshop ${index + 1}`,
        startAt: past,
        endAt: pastEnd,
        mode: "online",
        state: "completed",
        settlement: null,
        report: {
          id: `report-${index}`,
          sessionId: `session-${index}`,
          version: 1,
          discussion: ["Reviewed a proof"],
          strengths: ["Clear reasoning"],
          improvements: ["Practise another example"],
          createdAt: past,
          updatedAt: past,
        },
      }));
    else if (procedure === "admin/listAcademyClasses")
      data =
        input.state === "draft"
          ? [{ ...cohort, id: "draft-fixture", state: "draft" }]
          : input.state === "published"
            ? [cohort]
            : [];
    else if (procedure === "admin/listCompetitionCatalog") data = [];
    else if (procedure === "wallet/get")
      data = { totalBalance: 200, heldBalance: 0, availableBalance: 200 };
    else if (procedure.startsWith("notification/"))
      data = { items: [], count: 0 };
    else if (procedure === "booking/list") data = { items: [], total: 0 };
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  await page.route("**/reports/student/summary", (route) =>
    route.fulfill({
      json: {
        reportCount: 1,
        periodStart: past,
        generatedAt: past,
        timezone: "Asia/Jakarta",
      },
    }),
  );
  return errors;
}
async function assertFits(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

test.use({ storageState: { cookies: [], origins: [] } });
for (const role of ["student", "admin"] as const) {
  test(`${role} downloads a private report for the correct student`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors = await mockClasses(page, role);
    let requested: unknown;
    await page.route("**/reports/student/pdf", (route) => {
      requested = route.request().postDataJSON();
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.7\nsynthetic download fixture",
      });
    });
    await page.goto("/class-reports", { waitUntil: "domcontentloaded" });
    if (role === "admin") {
      await expect(
        page.getByRole("button", { name: "Download PDF", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Choose a student").fill("Export");
      await page
        .getByRole("group", { name: "Student search results" })
        .getByRole("button", { name: /Export Student/ })
        .click();
    }
    const downloading = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    expect((await downloading).suggestedFilename()).toMatch(
      /^student-session-reports-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    expect(requested).toEqual(
      role === "admin" ? { studentId: "export-student" } : {},
    );
    expect(errors).toEqual([]);
  });
}
test("student sees an explicit empty report state and tutors have no export controls", async ({
  page,
}) => {
  const errors = await mockClasses(page, "student");
  await page.route("**/reports/student/summary", (route) =>
    route.fulfill({
      json: {
        reportCount: 0,
        periodStart: past,
        generatedAt: past,
        timezone: "Asia/Jakarta",
      },
    }),
  );
  await page.goto("/class-reports");
  await expect(
    page.getByText("No eligible reports in the last three calendar months", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  await mockClasses(page, "tutor");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Session reports", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Download student report PDF", { exact: true }),
  ).toHaveCount(0);
});
for (const width of [320, 390, 768, 1440]) {
  test(`catalog and enrollment remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await mockClasses(page, "student");
    if (width === 768)
      await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    await page.goto("/classes");
    await expect(page.getByTestId(`class-card-${classId}`)).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath(`classes-catalog-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Masterclasses", exact: true })
      .click();
    await expect(page.getByTestId(`class-card-${classId}`)).toHaveCount(0);
    await page
      .getByRole("button", { name: "All classes", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Search classes" }).fill("algebra");
    await expect(
      page.getByRole("status").filter({ hasText: "1 class found" }),
    ).toBeVisible();
    await assertFits(page);
    await page
      .getByRole("button", { name: `View ${cohort.titleEn}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Curriculum and schedule" }),
    ).toBeVisible();
    await expect(
      page.getByText("Your payment summary", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toBeEnabled();
    await assertFits(page);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`classes-student-${width}.png`),
      fullPage: true,
    });
  });
  test(`admin class studio separates drafts and management at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await mockClasses(page, "admin");
    await page.goto("/admin-classes");
    const card = page.getByTestId(`published-class-${classId}`);
    await expect(card).toBeVisible();
    await expect(page.getByLabel("Class type", { exact: true })).toBeHidden();
    await card
      .getByRole("button", { name: "Manage class", exact: true })
      .click();
    await expect(
      card.getByText("Individual session cancellation", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Drafts & editor" }).click();
    await expect(page.getByLabel("Class type", { exact: true })).toBeVisible();
    await assertFits(page);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`classes-admin-${width}.png`),
      fullPage: true,
    });
  });
}
for (const role of ["student", "tutor", "admin"] as const) {
  test(`${role} can reach a selected report on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await mockClasses(page, role);
    await page.goto("/class-reports");
    const row = page.getByTestId("session-report-row-session-1");
    await row.getByRole("button").click();
    const panel = page.getByRole("region", {
      name:
        role === "student"
          ? "Selected session report"
          : "Selected session report editor",
      exact: true,
    });
    await expect(panel).toBeFocused();
    await expect(
      panel.getByText("Session 2: Problem solving workshop 2", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await panel.evaluate((element) => element.getBoundingClientRect().top),
    ).toBeLessThan(422);
    await assertFits(page);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`classes-report-${role}-390.png`),
      fullPage: true,
    });
  });
}
