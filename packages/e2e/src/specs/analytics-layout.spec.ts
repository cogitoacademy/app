import { expect, test, type Page } from "@playwright/test";

const analytics = {
  period: "30d",
  periodStart: "2026-10-01T17:00:00.000Z",
  periodEnd: "2026-10-30T16:59:59.999Z",
  summary: {
    bookings: 12,
    completedBookings: 8,
    resolvedBookings: 10,
    completionRate: 80,
    activeLearners: 6,
    newStudents: 3,
    newTutors: 1,
  },
  bookingTrend: [],
  userTrend: [],
  stateBreakdown: [],
  modalityBreakdown: [],
  categoryBreakdown: [],
  businessSummary: {
    totalAccounts: 25,
    totalStudents: 20,
    totalTutors: 4,
    signups: 4,
    monthlyActiveUsers: 15,
    inactiveUsers: 5,
    churnedUsers: 2,
    churnRate: 10,
    studentsWithMarks: 12,
    studentsWithoutMarks: 8,
    studentsWithMarksRate: 60,
    payingStudents: 10,
    paidConversionRate: 50,
    grossReceiptsIdr: 1234567,
    refundedIdr: 100000,
    netReceiptsIdr: 1134567,
  },
  operationsSummary: {
    unavailablePrivateRates: 0,
    unavailablePaymentDates: 0,
    delivered: {
      privateMarks: 321,
      privateSessions: 7,
      academyMarks: 654,
      academySeatSessions: 19,
    },
    upcoming: {
      privateFundedMarks: 112,
      privateUnfundedMarks: 23,
      privateSeatSessions: 4,
      academyFundedMarks: 456,
      academyUnfundedMarks: 78,
      academySeatSessions: 12,
    },
    tutorFees: { earnedIdr: 987654, paidIdr: 456789, unpaidIdr: 530865 },
    asOf: "2026-10-30T10:00:00.000Z",
  },
};

async function mockDashboard(
  page: Page,
  mode: "normal" | "zero" | "error" | "missing-rates" = "normal",
) {
  const payload = structuredClone(analytics);
  if (mode === "zero") {
    for (const section of [
      payload.operationsSummary.delivered,
      payload.operationsSummary.upcoming,
      payload.operationsSummary.tutorFees,
    ]) {
      for (const key of Object.keys(section))
        (section as Record<string, number>)[key] = 0;
    }
    payload.businessSummary.grossReceiptsIdr = 0;
    payload.businessSummary.netReceiptsIdr = 0;
    payload.businessSummary.refundedIdr = 0;
  }
  if (mode === "missing-rates") {
    payload.operationsSummary.unavailablePrivateRates = 2;
    payload.operationsSummary.unavailablePaymentDates = 1;
  }
  const errors: string[] = [];
  const calls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://localhost:3356") return route.continue();
    if (url.origin !== "http://localhost:3357") {
      errors.push(`Unexpected origin: ${url.origin}`);
      return route.abort();
    }
    const procedure = url.pathname;
    calls.push(procedure);
    const user = {
      id: "analytics-admin",
      name: "Analytics Admin",
      email: "analytics@example.test",
      role: "admin",
      emailVerified: true,
      image: null,
    };
    if (procedure.includes("/api/auth/")) {
      return route.fulfill({
        json: {
          user,
          session: {
            id: "synthetic",
            userId: user.id,
            expiresAt: "2099-01-01T00:00:00Z",
          },
        },
      });
    }
    let data: unknown = [];
    if (procedure.endsWith("getDashboardAnalytics")) {
      if (mode === "error")
        return route.fulfill({
          status: 500,
          json: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Synthetic analytics unavailable",
          },
        });
      data = payload;
    } else if (procedure.endsWith("listBookings"))
      data = { items: [], nextCursor: null };
    else if (procedure.endsWith("adminStats")) data = { pending: 0 };
    else if (procedure.includes("notification/"))
      data = { items: [], count: 0 };
    else if (procedure.endsWith("getProfile")) data = user;
    return route.fulfill({ json: { json: data, meta: [] } });
  });
  return { errors, calls };
}

function metric(page: Page, label: string) {
  return page
    .locator('[data-slot="card"], dl > div')
    .filter({ has: page.getByText(label, { exact: true }) });
}

for (const width of [390, 1440]) {
  test(`Q15 analytics separates receipts, delivery, commitments and tutor costs at ${width}px`, async ({
    page,
  }) => {
    const { errors, calls } = await mockDashboard(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Read the business at a glance" }),
    ).toBeVisible();
    const expectations = [
      ["Top-up receipts", /1[.,]134[.,]567/],
      ["Private service delivered", /321/],
      ["Academy service delivered", /654/],
      ["Upcoming private sessions", /112/],
      ["Upcoming Academy seats", /456/],
      ["Tutor fees earned", /987[.,]654/],
      ["Tutor fees paid", /456[.,]789/],
      ["Tutor fees unpaid", /530[.,]865/],
    ] as const;
    await Promise.all(
      expectations.map(async ([label, expected]) => {
        const item = metric(page, label);
        await expect(item).toHaveCount(1);
        await expect(item).toContainText(expected);
      }),
    );
    await expect(
      page.getByText("Net top-up revenue", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Booking-money totals are unavailable/),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    expect(calls.some((path) => path.endsWith("getDashboardAnalytics"))).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test("Q15 recorded zero facts remain explicit zeros", async ({ page }) => {
  const { errors } = await mockDashboard(page, "zero");
  await page.goto("/admin");
  await expect(metric(page, "Private service delivered")).toContainText(
    "0 Marks",
  );
  await expect(metric(page, "Academy service delivered")).toContainText(
    "0 Marks",
  );
  await expect(metric(page, "Upcoming private sessions")).toContainText(
    "0 funded Marks",
  );
  await expect(metric(page, "Tutor fees earned")).toContainText(/Rp\s*0/);
  expect(errors).toEqual([]);
});

test("Q15 read failure shows retry rather than invented zero metrics", async ({
  page,
}) => {
  const { calls, errors } = await mockDashboard(page, "error");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Business insights are unavailable" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Private service delivered", { exact: true }),
  ).toHaveCount(0);
  const before = calls.filter((path) =>
    path.endsWith("getDashboardAnalytics"),
  ).length;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect
    .poll(
      () =>
        calls.filter((path) => path.endsWith("getDashboardAnalytics")).length,
    )
    .toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test("Q15 missing private rates are disclosed without disguising missing amounts as zero", async ({
  page,
}) => {
  const { errors } = await mockDashboard(page, "missing-rates");
  await page.goto("/admin");
  await expect(
    page.getByText(
      "Some upcoming rates are unavailable; totals exclude those seats.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Some successful payments have no success date; period receipts exclude them.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
