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
    else if (procedure === "booking/listMine")
      data = { items: [], counts: { action: 0, upcoming: 0, completed: 0 } };
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
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
      await page.screenshot({
        path: test.info().outputPath(`classes-catalog-${width}.png`),
        fullPage: true,
      });
    await page.getByRole("tab", { name: "Masterclasses", exact: true }).click();
    await expect(page.getByTestId(`class-card-${classId}`)).toHaveCount(0);
    await page.getByRole("tab", { name: "All classes", exact: true }).click();
    await page.getByRole("textbox", { name: "Search classes" }).fill("algebra");
    await expect(
      page.getByRole("status").filter({ hasText: "1 class found" }),
    ).toBeVisible();
    await assertFits(page);
    await page
      .getByRole("link", {
        name: `View details and enrollment for ${cohort.titleEn}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Curriculum and schedule" }),
    ).toBeVisible();
    await expect(
      page.getByText("Booking summary", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toBeEnabled();
    await assertFits(page);
    expect(errors).toEqual([]);
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
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
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
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
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
      await page.screenshot({
        path: test.info().outputPath(`classes-report-${role}-390.png`),
        fullPage: true,
      });
  });
}

for (const role of ["student", "tutor", "admin"] as const) {
  for (const width of [390, 1440]) {
    test(`sidebar sections toggle independently for ${role} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors = await mockClasses(page, role);
      await page.route("**/rpc/booking/listMine**", (route) =>
        route.fulfill({
          json: { json: { items: [{}, {}, {}], nextCursor: null }, meta: [] },
        }),
      );
      await page.goto("/class-reports");
      if (width < 1280)
        await page
          .getByRole("button", { name: "Open sidebar", exact: true })
          .click();
      const sidebar = page.locator("#app-sidebar");
      await expect
        .poll(() =>
          sidebar.evaluate((element) =>
            Math.round(element.getBoundingClientRect().x),
          ),
        )
        .toBe(0);
      const labels =
        role === "admin"
          ? [
              "Overview",
              "Teaching",
              "Finance",
              "Content & reviews",
              "Resources",
            ]
          : [
              "Overview",
              role === "student" ? "Learning" : "Teaching",
              "Resources",
            ];
      await Promise.all(
        labels.map((label) =>
          expect(
            sidebar.getByRole("button", { name: label, exact: true }),
          ).toHaveAttribute("aria-expanded", "true"),
        ),
      );
      if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
        await page.screenshot({
          path: test.info().outputPath("sidebar-expanded.png"),
        });
      const overview = sidebar.getByRole("button", {
        name: "Overview",
        exact: true,
      });
      const workflow = sidebar.getByRole("button", {
        name: labels[1],
        exact: true,
      });
      await overview.focus();
      await page.keyboard.press("Enter");
      await expect(overview).toHaveAttribute("aria-expanded", "false");
      await expect(
        sidebar.getByRole("link", { name: "Dashboard", exact: true }),
      ).toHaveCount(0);
      if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
        await page.screenshot({
          path: test.info().outputPath("sidebar-collapsed-focus.png"),
        });
      await page.keyboard.press("Tab");
      await expect(workflow).toBeFocused();
      await page.keyboard.press("Space");
      await expect(workflow).toHaveAttribute("aria-expanded", "false");
      await expect(
        sidebar.getByRole("link", { name: "Session reports", exact: true }),
      ).toHaveCount(0);
      await expect(overview).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Space");
      await expect(workflow).toHaveAttribute("aria-expanded", "true");
      await expect(
        sidebar.getByRole("link", { name: "Session reports", exact: true }),
      ).toHaveAttribute("data-active", "true");
      await expect(
        sidebar.getByRole("link", { name: /3 needs action/ }),
      ).toBeVisible();
      const resources = sidebar.getByRole("button", {
        name: "Resources",
        exact: true,
      });
      await resources.click();
      await expect(
        sidebar.getByRole("button", { name: "WhatsApp Support", exact: true }),
      ).toHaveCount(0);
      await expect(
        sidebar.getByRole("button", { name: /Class UI/ }),
      ).toBeVisible();
      await resources.click();
      await sidebar
        .getByRole("button", { name: "WhatsApp Support", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { includeHidden: true }),
      ).toHaveCount(0);
      await overview.click();
      await expect(overview).toHaveAttribute("aria-expanded", "true");
      if (role !== "admin")
        await expect(
          sidebar.getByRole("link", { name: "Tutor payouts", exact: true }),
        ).toHaveCount(0);
      await sidebar
        .getByRole("link", { name: "How it works", exact: true })
        .click();
      await expect(page).toHaveURL(/\/guide$/);
      if (width < 1280)
        await expect(
          page.getByRole("button", { name: "Open sidebar", exact: true }),
        ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

// Detail redesign coverage uses synthetic auth/RPC; it does not exercise a live checkout.
async function detailFixture(page: Page, item: unknown = cohort) {
  const errors = await mockClasses(page, "student");
  await page.route(/\/rpc\/classes\/get(?:\?|$)/, (route) =>
    route.fulfill({ json: { json: item, meta: [] } }),
  );
  return errors;
}

for (const width of [320, 390, 1440]) {
  test(`detail overview and keyboard curriculum work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await detailFixture(page, {
      ...cohort,
      descriptionEn: "Detailed curriculum description. ".repeat(40),
      sessions: [
        cohort.sessions[0],
        {
          ...cohort.sessions[0],
          id: "later",
          sequenceNumber: 2,
          titleEn: "A second session",
        },
      ],
    });
    await page.goto(`/classes/${classId}`);
    await expect(
      page.getByRole("heading", { name: cohort.titleEn, exact: true }),
    ).toBeVisible();
    const description = page.getByRole("button", {
      name: "See more",
      exact: true,
    });
    await description.click();
    await expect(
      page.getByRole("button", { name: "See less" }),
    ).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "See less" }).click();
    await expect(description).toHaveAttribute("aria-expanded", "false");
    const trigger = page.getByRole("button", { name: /Patterns, proofs/ });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(cohort.sessions[0]!.curriculumEn, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /A second session/ }).click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const overview = await page
      .getByRole("region", { name: cohort.titleEn, exact: true })
      .boundingBox();
    const enrollment = await page
      .getByRole("complementary", { name: "Class enrollment" })
      .boundingBox();
    const content = await page
      .getByRole("heading", { name: "Curriculum and schedule" })
      .boundingBox();
    expect(overview).toBeTruthy();
    expect(enrollment).toBeTruthy();
    expect(content).toBeTruthy();
    if (width === 1440) {
      expect(enrollment!.x).toBeGreaterThan(overview!.x);
      expect(Math.abs(enrollment!.y - overview!.y)).toBeLessThan(2);
    } else {
      expect(enrollment!.y).toBeGreaterThan(overview!.y);
      expect(content!.y).toBeGreaterThan(enrollment!.y);
    }
    await assertFits(page);
    expect(errors).toEqual([]);
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
      await page.screenshot({
        path: test.info().outputPath(`class-detail-${width}.png`),
        fullPage: true,
      });
  });
}

test("detail masterclass shows tutor and missing fields fall back safely", async ({
  page,
}) => {
  const errors = await detailFixture(page, {
    ...masterclass,
    masterclassRateMarks: null,
    sessions: [
      {
        ...cohort.sessions[0],
        tutor: null,
        curriculumEn: null,
        mode: "offline",
      },
    ],
  });
  await page.goto(`/classes/${classId}`);
  await expect(
    page.getByText("Price unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Tutor to be announced", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Patterns, proofs/ }).click();
  await expect(
    page.getByText("Curriculum to be announced.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Meeting details are available to enrolled students."),
  ).toHaveCount(0);
  await assertFits(page);
  expect(errors).toEqual([]);
});

test("detail empty schedule and invalid rates have explicit fallbacks", async ({
  page,
}) => {
  const errors = await detailFixture(page, {
    ...cohort,
    sessions: [],
    cohortFullRateMarks: 0,
    cohortHalfRateMarks: null,
    cohortSingleRateMarks: null,
  });
  await page.goto(`/classes/${classId}`);
  await expect(
    page.getByText("Schedule to be announced", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Price unavailable", { exact: true }),
  ).toBeVisible();
  await assertFits(page);
  expect(errors).toEqual([]);
});

for (const state of ["draft", "cancelled", "completed"]) {
  test(`detail rejects ${state} classes`, async ({ page }) => {
    const errors = await detailFixture(page, { ...cohort, state });
    await page.goto(`/classes/${classId}`);
    await expect(
      page.getByRole("heading", { name: "Class unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Class enrollment" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("detail preserves postponed enrollment state", async ({ page }) => {
  const errors = await detailFixture(page, { ...cohort, state: "postponed" });
  await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
    route.fulfill({
      json: {
        json: {
          classId,
          classState: "postponed",
          freeExitUntil: future,
          enrollments: [],
          eligibleSessions: [],
        },
        meta: [],
      },
    }),
  );
  await page.goto(`/classes/${classId}`);
  await expect(page.getByText("Postponed once", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reserve and confirm Marks" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const access of ["signed-out", "unverified", "tutor"] as const) {
  test(`detail preserves ${access} enrollment gate`, async ({ page }) => {
    const errors = await detailFixture(page);
    await page.route("**/api/auth/get-session**", (route) =>
      route.fulfill({
        json:
          access === "signed-out"
            ? null
            : {
                user: {
                  id: "gate-user",
                  name: "Gate user",
                  email: "gate@example.test",
                  emailVerified: access !== "unverified",
                  role: access === "tutor" ? "tutor" : "student",
                },
                session: {
                  id: "gate",
                  userId: "gate-user",
                  expiresAt: "2099-01-01T00:00:00.000Z",
                },
              },
      }),
    );
    await page.goto(`/classes/${classId}`);
    if (access === "signed-out") {
      await expect(page).toHaveURL(/\/login/);
      await expect(
        page.getByRole("complementary", { name: "Class enrollment" }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      return;
    }
    if (access === "tutor") {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(
        page.getByRole("complementary", { name: "Class enrollment" }),
      ).toHaveCount(0);
      expect(errors).toEqual([]);
      return;
    }
    await expect(
      page.getByText(
        access === "unverified"
          ? "Verify your email to enroll"
          : "Student account required",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("detail loading and failed RPC never show enrollment controls", async ({
  page,
}) => {
  const errors = await mockClasses(page, "student");
  let failRequest!: () => void;
  const ready = new Promise<void>((resolve) => {
    failRequest = resolve;
  });
  await page.route(/\/rpc\/classes\/get(?:\?|$)/, async (route) => {
    await ready;
    await route.fulfill({ status: 404, json: { message: "Class not found" } });
  });
  await page.goto(`/classes/${classId}`);
  await expect(
    page.getByText("Loading class details…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Class enrollment" }),
  ).toHaveCount(0);
  failRequest();
  await expect(
    page.getByRole("heading", { name: "Class unavailable" }),
  ).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test("detail enrollment RPC failure has a retry action", async ({ page }) => {
  await detailFixture(page);
  await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
    route.fulfill({ status: 500, json: { message: "Unavailable" } }),
  );
  await page.goto(`/classes/${classId}`);
  await expect(
    page.getByText("Enrollment status unavailable", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Refresh enrollment status" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reserve and confirm Marks" }),
  ).toHaveCount(0);
});

test("detail sold out session prevents checkout", async ({ page }) => {
  const errors = await detailFixture(page);
  await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
    route.fulfill({
      json: {
        json: {
          classId,
          classState: "published",
          enrollments: [],
          eligibleSessions: [
            {
              sessionId,
              sequenceNumber: 1,
              startAt: future,
              seatsAvailable: 0,
              alreadyEntitled: false,
            },
          ],
        },
        meta: [],
      },
    }),
  );
  await page.goto(`/classes/${classId}`);
  await expect(
    page.getByText("No seat is available for the selected sessions.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reserve and confirm Marks" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("detail sorts dates and wraps long content on narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1000 });
  const errors = await detailFixture(page, {
    ...cohort,
    titleEn: "LongTitle".repeat(35),
    descriptionEn: "Description".repeat(100),
    cohortHalfRateMarks: 10,
    sessions: [
      {
        ...cohort.sessions[0],
        sequenceNumber: 2,
        id: "second",
        startAt: future,
      },
      {
        ...cohort.sessions[0],
        startAt: past,
        titleEn: "SessionTitle".repeat(30),
        curriculumEn: "Curriculum".repeat(150),
      },
    ],
  });
  await page.goto(`/classes/${classId}`);
  const overview = page.getByRole("region", {
    name: "LongTitle".repeat(35),
    exact: true,
  });
  await expect(overview.getByLabel("10 Marks", { exact: true })).toBeVisible();
  const triggers = page.locator('[data-slot="accordion-trigger"]');
  await expect(triggers.first()).toContainText("SessionTitle");
  await triggers.first().click();
  await page.getByRole("button", { name: "See more", exact: true }).click();
  await assertFits(page);
  expect(errors).toEqual([]);
});

test("detail single-session selection sends the chosen mid-cohort session", async ({
  page,
}) => {
  const errors = await detailFixture(page, {
    ...cohort,
    sessions: [
      { ...cohort.sessions[0], startAt: past },
      {
        ...cohort.sessions[0],
        id: "middle",
        sequenceNumber: 2,
        titleEn: "Middle session",
      },
      {
        ...cohort.sessions[0],
        id: "last",
        sequenceNumber: 3,
        titleEn: "Last session",
      },
    ],
  });
  await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
    route.fulfill({
      json: {
        json: {
          classId,
          classState: "published",
          enrollments: [],
          eligibleSessions: ["middle", "last"].map((id, index) => ({
            sessionId: id,
            sequenceNumber: index + 2,
            startAt: future,
            seatsAvailable: 3,
            alreadyEntitled: false,
          })),
        },
        meta: [],
      },
    }),
  );
  let submitted: unknown;
  await page.route("**/rpc/classes/createEnrollment**", (route) => {
    submitted = route.request().postDataJSON().json;
    return route.fulfill({ json: { json: { id: "reserved" }, meta: [] } });
  });
  await page.goto(`/classes/${classId}`);
  const panel = page.getByRole("complementary", { name: "Class enrollment" });
  await expect(panel.locator('[data-slot="card"]')).toHaveCount(1);
  await page.getByRole("tab", { name: "Single session", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reserve and confirm Marks" }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: /Session 2 · Middle session/ }).check();
  await expect(
    page.getByRole("radio", { name: /Session 2 · Middle session/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Reserve and confirm Marks" }).click();
  await expect
    .poll(() => submitted)
    .toMatchObject({
      classId,
      plan: "single",
      sessionId: "middle",
      requestKey: expect.any(String),
    });
  expect(errors).toEqual([]);
});

for (const scenario of [
  "pending",
  "second-installment",
  "shortfall",
  "defaulted",
] as const) {
  test(`detail concise panel preserves ${scenario} controls`, async ({
    page,
  }) => {
    const errors = await detailFixture(page);
    const pending = scenario === "pending" || scenario === "shortfall";
    await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
      route.fulfill({
        json: {
          json: {
            classId,
            classState: "published",
            eligibleSessions: [],
            enrollments: [
              {
                id: "enrollment-fixture",
                plan: pending ? "full" : "half",
                state: pending ? "checkout_pending" : "active",
                totalMarks: 40,
                sessionCount: 2,
                firstInstallmentMarks: 20,
                secondInstallmentMarks: pending ? 0 : 20,
                checkoutExpiresAt: future,
                allocations: [],
                installments: [
                  {
                    ordinal: 1,
                    state: pending ? "pending" : "paid",
                    amountMarks: 20,
                    dueAt: null,
                  },
                  ...(!pending
                    ? [
                        {
                          ordinal: 2,
                          state:
                            scenario === "defaulted" ? "defaulted" : "pending",
                          amountMarks: 20,
                          dueAt: future,
                        },
                      ]
                    : []),
                ],
              },
            ],
          },
          meta: [],
        },
      }),
    );
    if (scenario === "shortfall")
      await page.route("**/rpc/wallet/get**", (route) =>
        route.fulfill({
          json: {
            json: { totalBalance: 0, heldBalance: 0, availableBalance: 0 },
            meta: [],
          },
        }),
      );
    await page.goto(`/classes/${classId}`);
    const panel = page.getByRole("complementary", { name: "Class enrollment" });
    await expect(panel.locator('[data-slot="card"]')).toHaveCount(1);
    if (scenario === "pending")
      await expect(
        panel.getByRole("button", { name: /Use.*to reserve/ }),
      ).toBeEnabled();
    if (scenario === "second-installment")
      await expect(
        panel.getByRole("button", { name: /Pay second installment/ }),
      ).toBeEnabled();
    if (scenario === "shortfall")
      await expect(
        panel.getByRole("button", { name: "Top up 20 Marks" }),
      ).toBeEnabled();
    if (scenario === "defaulted")
      await expect(panel.getByText(/The deadline passed/)).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toHaveCount(0);
    await assertFits(page);
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 1440]) {
  test(`detail plan tabs support direct and keyboard selection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await detailFixture(page);
    await page.goto(`/classes/${classId}`);
    const tabs = page.getByRole("tablist", {
      name: "Enrollment plan",
      exact: true,
    });
    const full = tabs.getByRole("tab", { name: "Full", exact: true });
    const half = tabs.getByRole("tab", { name: "Half", exact: true });
    const single = tabs.getByRole("tab", {
      name: "Single session",
      exact: true,
    });
    await expect(full).toHaveAttribute("aria-selected", "true");
    await half.click();
    await expect(half).toHaveAttribute("aria-selected", "true");
    await expect(full).toHaveAttribute("aria-selected", "false");
    await half.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(single).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("radiogroup", { name: "Upcoming session" }),
    ).toBeVisible();
    await full.click();
    await expect(
      page.getByRole("radiogroup", { name: "Upcoming session" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toBeEnabled();
    const trigger = page.locator('[data-slot="accordion-trigger"]').first();
    const padding = await trigger.evaluate((element) => ({
      top: parseFloat(getComputedStyle(element).paddingTop),
      bottom: parseFloat(getComputedStyle(element).paddingBottom),
    }));
    expect(padding.top + padding.bottom).toBeLessThan(32);
    await assertFits(page);
    expect(errors).toEqual([]);
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
      await page.screenshot({
        path: test.info().outputPath(`class-plan-tabs-${width}.png`),
        fullPage: true,
      });
  });
}

for (const width of [320, 1440]) {
  test(`detail radio selection and summary values work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = await detailFixture(page, {
      ...cohort,
      sessions: [
        cohort.sessions[0],
        {
          ...cohort.sessions[0],
          id: "middle",
          sequenceNumber: 2,
          titleEn: "Middle session",
          mode: "offline",
          tutor: { name: "Middle tutor" },
        },
        {
          ...cohort.sessions[0],
          id: "last",
          sequenceNumber: 3,
          titleEn: "Last session",
        },
      ],
    });
    await page.route("**/rpc/classes/getMyEnrollments**", (route) =>
      route.fulfill({
        json: {
          json: {
            classId,
            classState: "published",
            enrollments: [],
            eligibleSessions: [
              {
                sessionId,
                sequenceNumber: 1,
                startAt: future,
                seatsAvailable: 0,
                alreadyEntitled: false,
              },
              {
                sessionId: "middle",
                sequenceNumber: 2,
                startAt: future,
                seatsAvailable: 3,
                alreadyEntitled: false,
              },
              {
                sessionId: "last",
                sequenceNumber: 3,
                startAt: future,
                seatsAvailable: 3,
                alreadyEntitled: true,
              },
            ],
          },
          meta: [],
        },
      }),
    );
    await page.goto(`/classes/${classId}`);
    const panel = page.getByRole("complementary", { name: "Class enrollment" });
    await page
      .getByRole("tab", { name: "Single session", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: "Choose a session", exact: true }),
    ).toBeDisabled();
    const radios = page.getByRole("radiogroup", { name: "Upcoming session" });
    await expect(radios.getByRole("radio")).toHaveCount(1);
    const middle = radios.getByRole("radio", { name: /Middle session/ });
    await middle.focus();
    await page.keyboard.press("Space");
    await expect(middle).toBeChecked();
    await expect(
      panel.getByText("Middle tutor", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText("In person", { exact: true })).toBeVisible();
    const reserve = panel
      .locator("dl > div")
      .filter({ has: page.locator("dt", { hasText: /^Reserve now$/ }) });
    await expect(reserve.getByLabel("25 Marks", { exact: true })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Reserve and confirm Marks" }),
    ).toBeEnabled();
    await expect(panel.locator('[data-slot="card"]')).toHaveCount(1);
    await expect(
      panel.locator('[data-slot="card-footer"] > button'),
    ).toBeVisible();
    await assertFits(page);
    expect(errors).toEqual([]);
    if (!process.env.PLAYWRIGHT_NO_ARTIFACTS)
      await page.screenshot({
        path: test.info().outputPath(`booking-summary-radio-${width}.png`),
        fullPage: true,
      });
  });
}
