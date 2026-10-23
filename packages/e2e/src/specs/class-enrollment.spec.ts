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
  FRIEND_EMAIL,
  STUDENT_EMAIL,
  STUDENT_PASSWORD,
  T05_CLASS_ENROLLMENT_STUDENT_EMAIL,
} from "../fixtures/test-accounts";
import { resetE2eAuthRateLimit } from "../fixtures/auth-rate-limit";

type AdminClass = {
  id: string;
  version: number;
  state: string;
  sessions: { id: string; sequenceNumber: number }[];
};

type Enrollment = {
  id: string;
  plan: "full" | "half" | "single";
  state: string;
  firstInstallmentMarks: number;
  secondInstallmentMarks: number;
  totalMarks: number;
  allocations: {
    sessionId: string;
    rateMarks: number;
    state: string;
    fundedMarks: number;
  }[];
  installments: { ordinal: number; amountMarks: number; state: string }[];
};

type TopUpQuote = {
  attemptId: string;
  requestKey: string;
  quoteId: string;
  requestedMarks: number;
};

let nextCohortIndex = 0;
let testRunStartOffsetDays = 0;

function assertT05EnrollmentTarget() {
  const dbPort = process.env.T05_ENROLLMENT_TEST_DB_PORT;
  const redisPort = process.env.T05_ENROLLMENT_TEST_REDIS_PORT;
  const serverPort = process.env.T05_ENROLLMENT_TEST_SERVER_PORT;
  const webPort = process.env.T05_ENROLLMENT_TEST_WEB_PORT;
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  const redisUrl = new URL(process.env.REDIS_URL ?? "");
  const serverUrl = new URL(
    process.env.SERVER_URL ?? process.env.BETTER_AUTH_URL ?? "",
  );
  const webUrl = new URL(process.env.WEB_URL ?? "");
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    process.env.NODE_ENV !== "test" ||
    dbPort !== "6769" ||
    redisPort !== "6381" ||
    serverPort !== "3201" ||
    webPort !== "3200" ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !loopback.has(databaseUrl.hostname.toLowerCase()) ||
    databaseUrl.port !== dbPort ||
    databaseUrl.pathname !== "/cogito-test" ||
    redisUrl.protocol !== "redis:" ||
    !loopback.has(redisUrl.hostname.toLowerCase()) ||
    redisUrl.port !== redisPort ||
    serverUrl.protocol !== "http:" ||
    !loopback.has(serverUrl.hostname.toLowerCase()) ||
    serverUrl.port !== serverPort ||
    webUrl.protocol !== "http:" ||
    !loopback.has(webUrl.hostname.toLowerCase()) ||
    webUrl.port !== webPort
  ) {
    throw new Error(
      "Class enrollment E2E requires the configured loopback T05 test targets.",
    );
  }
}

async function createApiContext(email: string, password: string) {
  resetE2eAuthRateLimit();
  const context = await request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3201",
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

function toDateTimeLocal(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

async function createPublishedCohort(
  adminApi: APIRequestContext,
  references: { competitionId: string; tutorId: string },
  options: {
    title: string;
    sessions: number;
    capacity?: number;
    minimumEnrollment?: number;
    minimumCheckAt?: string;
  },
): Promise<AdminClass> {
  const cohortIndex = nextCohortIndex++;
  const firstStart = new Date(
    Date.UTC(2045, 0, 1 + testRunStartOffsetDays + cohortIndex * 300, 10),
  );
  const sessions = Array.from({ length: options.sessions }, (_, index) => {
    const startAt = new Date(firstStart.getTime() + index * 7 * 86_400_000);
    return {
      capacity: options.capacity ?? 4,
      titleEn: `Enrollment E2E session ${index + 1}`,
      titleId: null,
      curriculumEn: "Synthetic enrollment test fixture.",
      curriculumId: null,
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000).toISOString(),
      mode: "online" as const,
      roomId: null,
      tutorId: references.tutorId,
    };
  });
  const draft = await rpc<AdminClass>(adminApi, "admin/saveAcademyClassDraft", {
    kind: "cohort",
    competitionId: references.competitionId,
    titleEn: options.title,
    titleId: null,
    descriptionEn: "Synthetic cohort for T05 enrollment browser coverage.",
    descriptionId: null,
    coverKey: null,
    tutorFeeIdr: 400_000,
    reason: "Create a dedicated enrollment browser-test fixture",
    minimumEnrollment: options.minimumEnrollment ?? 1,
    minimumCheckAt:
      options.minimumCheckAt ?? new Date(Date.UTC(2044, 0, 1)).toISOString(),
    fullRateMarks: 20,
    halfRateMarks: 22,
    singleRateMarks: 25,
    sessions,
  });
  return rpc<AdminClass>(adminApi, "admin/publishAcademyClass", {
    id: draft.id,
    expectedVersion: draft.version,
    reason: "Publish a dedicated enrollment browser-test fixture",
  });
}

function captureRpc(
  page: Page,
  procedure: string,
  requests: { json: Record<string, unknown> }[],
) {
  const listener = (rpcRequest: { url(): string; postDataJSON(): unknown }) => {
    if (!rpcRequest.url().includes(`/rpc/${procedure}`)) return;
    const body = rpcRequest.postDataJSON() as {
      json?: Record<string, unknown>;
    };
    if (body?.json) requests.push({ json: body.json });
  };
  page.on("request", listener);
  return () => page.off("request", listener);
}

test("student enrolls in full, half, and single plans with stable checkout and installment state", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  assertT05EnrollmentTarget();
  if (!T05_CLASS_ENROLLMENT_STUDENT_EMAIL) {
    throw new Error("Missing isolated T05 class-enrollment student fixture");
  }
  const adminApi = await createApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  // This second 200-Mark run-scoped wallet is reserved for this multi-plan
  // journey. The T05 student also funds booking-flow holds and separate
  // lifecycle tests; sharing that mutable wallet made parallel tests race.
  const studentApi = await createApiContext(
    T05_CLASS_ENROLLMENT_STUDENT_EMAIL,
    STUDENT_PASSWORD,
  );
  const friendApi = await createApiContext(FRIEND_EMAIL, STUDENT_PASSWORD);
  let studentContext:
    | Awaited<ReturnType<typeof browser.newContext>>
    | undefined;
  let friendContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let continuationContext:
    | Awaited<ReturnType<typeof browser.newContext>>
    | undefined;
  let page: Page;
  let continuationPage: Page;

  try {
    studentContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await studentApi.storageState(),
    });
    page = await studentContext.newPage();
    continuationPage = page;

    const competitions = await rpc<
      { id: string; isActive: boolean; parentId: string | null }[]
    >(adminApi, "admin/listCompetitionCatalog", { includeArchived: false });
    const competition = competitions.find((entry) => entry.isActive);
    if (!competition) throw new Error("No active test competition was seeded");

    const tutors = await rpc<{ user: { id: string; role: string } }[]>(
      adminApi,
      "adminTutor/listTutorProfiles",
      {
        status: "published",
        limit: 100,
        offset: 0,
      },
    );
    const tutor = tutors.find((profile) => profile.user.role === "tutor");
    if (!tutor) throw new Error("No published test tutor was seeded");
    const references = {
      competitionId: competition.id,
      tutorId: tutor.user.id,
    };

    const suffix = randomUUID().slice(0, 8);
    // Keep retries isolated from already-published fixture sessions in the
    // disposable E2E database, where the seeded tutor is shared.
    testRunStartOffsetDays = Number.parseInt(suffix, 16) % 100_000;
    const fullClass = await createPublishedCohort(adminApi, references, {
      title: `T05 full ${suffix}`,
      sessions: 4,
      capacity: 1,
    });
    const halfClass = await createPublishedCohort(adminApi, references, {
      title: `T05 half ${suffix}`,
      sessions: 2,
    });
    const singleClass = await createPublishedCohort(adminApi, references, {
      title: `T05 single ${suffix}`,
      sessions: 1,
    });
    const insufficientClass = await createPublishedCohort(
      adminApi,
      references,
      { title: `T05 insufficient ${suffix}`, sessions: 4 },
    );

    const publicClass = await rpc<Record<string, unknown>>(
      studentApi,
      "classes/get",
      { id: fullClass.id },
    );
    expect(publicClass).not.toHaveProperty("tutorFeeIdr");
    expect(publicClass).not.toHaveProperty("students");
    for (const session of publicClass.sessions as Record<string, unknown>[]) {
      expect(session).not.toHaveProperty("tutorId");
      expect(session).not.toHaveProperty("roomId");
      expect(session).not.toHaveProperty("meeting");
    }

    await page.goto(`/classes/${fullClass.id}`);
    await expect(
      page.getByRole("heading", { name: "Your class enrollment" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Total:.*80 across 4 upcoming sessions\./),
    ).toBeVisible();
    await expect(page.locator('[aria-label="80 Marks"]')).toHaveCount(2);
    const fullCreateRequests: { json: Record<string, unknown> }[] = [];
    const stopCaptureFull = captureRpc(
      page,
      "classes/createEnrollment",
      fullCreateRequests,
    );
    await page
      .getByRole("button", { name: "Reserve and confirm Marks" })
      .click();
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    stopCaptureFull();

    const fullMine = await rpc<{
      enrollments: Enrollment[];
      eligibleSessions: { seatsAvailable: number; alreadyEntitled: boolean }[];
    }>(studentApi, "classes/getMyEnrollments", { classId: fullClass.id });
    expect(fullMine.enrollments).toHaveLength(1);
    expect(fullMine.enrollments[0]).toMatchObject({
      plan: "full",
      state: "active",
      totalMarks: 80,
      allocations: Array.from({ length: 4 }, () => ({
        state: "funded",
        fundedMarks: 20,
      })),
    });
    expect(
      fullMine.eligibleSessions.every((session) => session.alreadyEntitled),
    ).toBe(true);

    const fullRequest = fullCreateRequests[0]?.json;
    if (!fullRequest)
      throw new Error("The full-plan create request was not captured");
    expect(fullRequest?.classId).toBe(fullClass.id);
    const fullReplay = await rpc<Enrollment & { outcome: string }>(
      studentApi,
      "classes/createEnrollment",
      fullRequest,
    );
    expect(fullReplay.outcome).toBe("already_exists");
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByText("Enrollment total:")).toBeVisible();
    expect(
      (
        await rpc<{ enrollments: Enrollment[] }>(
          studentApi,
          "classes/getMyEnrollments",
          {
            classId: fullClass.id,
          },
        )
      ).enrollments,
    ).toHaveLength(1);

    friendContext = await browser.newContext({
      storageState: await friendApi.storageState(),
    });
    const friendPage = await friendContext.newPage();
    await friendPage.goto(`/classes/${fullClass.id}`);
    await expect(
      friendPage.getByText(
        "At least one remaining session has no seat for this plan.",
      ),
    ).toBeVisible();
    await friendContext.close();
    friendContext = undefined;

    const halfEligibilityResponse = page.waitForResponse((response) =>
      response.url().includes("/rpc/classes/getMyEnrollments"),
    );
    await page.goto(`/classes/${halfClass.id}`);
    const halfEligibilityBody = await (await halfEligibilityResponse).json();
    const halfEligibility = (
      halfEligibilityBody as {
        json: {
          eligibleSessions: {
            seatsAvailable: number;
            alreadyEntitled: boolean;
          }[];
        };
      }
    ).json;
    expect(halfEligibility.eligibleSessions).toHaveLength(2);
    expect(
      halfEligibility.eligibleSessions.map((session) => [
        session.seatsAvailable,
        session.alreadyEntitled,
      ]),
    ).toEqual([
      [4, false],
      [4, false],
    ]);
    await page.getByLabel("Plan").click();
    await page.getByRole("option", { name: "Half cohort" }).click();
    await expect(page.getByText(/First payment now:.*22/)).toBeVisible();
    await expect(page.getByText(/Second payment:.*22 before/)).toBeVisible();
    await expect(page.locator('[aria-label="22 Marks"]')).toHaveCount(2);
    const halfCreateRequests: { json: Record<string, unknown> }[] = [];
    const stopCaptureHalf = captureRpc(
      page,
      "classes/createEnrollment",
      halfCreateRequests,
    );
    await page
      .getByRole("button", { name: "Reserve and confirm Marks" })
      .click();
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    stopCaptureHalf();
    const halfMine = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: halfClass.id },
    );
    expect(halfMine.enrollments[0]).toMatchObject({
      plan: "half",
      firstInstallmentMarks: 22,
      secondInstallmentMarks: 22,
      totalMarks: 44,
    });
    expect(
      halfMine.enrollments[0]?.allocations.map((item) => item.state),
    ).toEqual(["funded", "unfunded_reserved"]);
    const halfRequest = halfCreateRequests[0]?.json;
    if (!halfRequest)
      throw new Error("The half-plan create request was not captured");
    expect(halfRequest?.classId).toBe(halfClass.id);
    expect(
      (
        await rpc<Enrollment & { outcome: string }>(
          studentApi,
          "classes/createEnrollment",
          halfRequest,
        )
      ).outcome,
    ).toBe("already_exists");

    await expect(
      page.getByRole("button", { name: /Pay second installment/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Pay second installment/ }).click();
    await expect(
      page.getByText(/Second installment is due before/),
    ).toBeVisible();
    const payAgain = await Promise.all([
      rpc<{ outcome: string }>(studentApi, "classes/paySecondInstallment", {
        enrollmentId: halfMine.enrollments[0]!.id,
      }),
      rpc<{ outcome: string }>(studentApi, "classes/paySecondInstallment", {
        enrollmentId: halfMine.enrollments[0]!.id,
      }),
    ]);
    expect(payAgain.map((result) => result.outcome)).toEqual([
      "funded",
      "funded",
    ]);
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Pay second installment/ }),
    ).toHaveCount(0);
    const paidHalf = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: halfClass.id },
    );
    expect(
      paidHalf.enrollments[0]?.allocations.every(
        (item) => item.fundedMarks === 22,
      ),
    ).toBe(true);
    expect(
      paidHalf.enrollments[0]?.installments.every(
        (item) => item.state === "funded",
      ),
    ).toBe(true);

    // Give the remaining journeys a clean renderer context after the full and
    // installment routes have exercised reloads and concurrent requests.
    const uiStorageState = await page.context().storageState();
    await page.close();
    continuationContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: uiStorageState,
    });
    continuationPage = await continuationContext.newPage();
    await continuationPage.goto(`/classes/${singleClass.id}`);
    await continuationPage.getByLabel("Plan").click();
    await continuationPage
      .getByRole("option", { name: "Single session" })
      .click();
    await continuationPage.getByLabel("Upcoming session").click();
    await continuationPage.getByRole("option").first().click();
    await expect(
      continuationPage.getByText(/Total:.*25 across 1 upcoming session\./),
    ).toBeVisible();
    await expect(
      continuationPage.locator('[aria-label="25 Marks"]'),
    ).toHaveCount(2);
    await continuationPage
      .getByRole("button", { name: "Reserve and confirm Marks" })
      .click();
    await expect(
      continuationPage.getByText("active", { exact: true }),
    ).toBeVisible();
    await continuationPage.reload({ waitUntil: "commit" });
    await expect(
      continuationPage.getByText("active", { exact: true }),
    ).toBeVisible();
    const singleMine = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: singleClass.id },
    );
    expect(singleMine.enrollments[0]).toMatchObject({
      plan: "single",
      totalMarks: 25,
      allocations: [{ rateMarks: 25, fundedMarks: 25, state: "funded" }],
    });

    const walletBeforeInsufficient = await rpc<{
      availableBalance: number;
    }>(studentApi, "wallet/get", {});
    await continuationPage.goto(`/classes/${insufficientClass.id}`);
    await expect(
      continuationPage.getByText(/Total:.*80 across 4 upcoming sessions\./),
    ).toBeVisible();
    await expect(
      continuationPage.locator('[aria-label="80 Marks"]'),
    ).toHaveCount(2);
    await continuationPage
      .getByRole("button", { name: "Reserve and confirm Marks" })
      .click();
    await expect(
      continuationPage.getByText("checkout pending", { exact: true }),
    ).toBeVisible();
    await expect(
      continuationPage.getByText(/This seat reservation expires/),
    ).toBeVisible();
    const insufficientMine = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: insufficientClass.id },
    );
    const pendingEnrollment = insufficientMine.enrollments[0];
    expect(pendingEnrollment).toMatchObject({
      plan: "full",
      state: "checkout_pending",
      totalMarks: 80,
    });
    expect(
      pendingEnrollment?.allocations.every((item) => item.fundedMarks === 0),
    ).toBe(true);
    const shortfallMarks = 80 - walletBeforeInsufficient.availableBalance;
    const topUpRequests: { json: Record<string, unknown> }[] = [];
    const stopCaptureTopUp = captureRpc(
      continuationPage,
      "classes/createTopUpQuote",
      topUpRequests,
    );
    const quoteResponse = continuationPage.waitForResponse((response) =>
      response.url().includes("/rpc/classes/createTopUpQuote"),
    );
    await continuationPage
      .getByRole("button", { name: `Top up ${shortfallMarks} Marks` })
      .click();
    const quoteResponseResult = await quoteResponse;
    expect(quoteResponseResult.ok()).toBe(true);
    const quote = ((await quoteResponseResult.json()) as { json: TopUpQuote })
      .json;
    stopCaptureTopUp();
    expect(quote.requestedMarks).toBe(shortfallMarks);
    const topUpRequest = topUpRequests[0]?.json;
    if (!topUpRequest)
      throw new Error("The top-up quote request was not captured");
    expect(topUpRequest).toMatchObject({
      enrollmentId: pendingEnrollment?.id,
      ordinal: 1,
    });
    await expect(
      continuationPage.getByRole("heading", {
        name: "Top up the quoted shortfall",
      }),
    ).toBeVisible();
    const quoteReplay = await rpc<TopUpQuote>(
      studentApi,
      "classes/createTopUpQuote",
      topUpRequest,
    );
    expect(quoteReplay).toMatchObject({
      attemptId: quote.attemptId,
      quoteId: quote.quoteId,
      requestedMarks: shortfallMarks,
    });
    // Cancellation uses real RPCs and wallet readback, after the enrollment
    // shortfall assertions so returned Marks cannot alter those expectations.
    await continuationPage.goto(`/classes/${singleClass.id}`);
    const walletBeforeCancel = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    await continuationPage
      .getByRole("button", { name: "Cancel session 1", exact: true })
      .click();
    const cancellationReview = continuationPage.getByRole("region", {
      name: "Cancellation review",
    });
    await expect(
      cancellationReview.getByText("Fee: 5 Marks · Return: 20 Marks"),
    ).toBeVisible();
    await cancellationReview
      .getByRole("button", { name: "Confirm seat cancellation", exact: true })
      .click();
    await expect(cancellationReview).toHaveCount(0);
    const walletAfterCancel = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    expect(walletAfterCancel.availableBalance).toBe(
      walletBeforeCancel.availableBalance + 20,
    );
    expect(walletAfterCancel.heldBalance).toBe(
      walletBeforeCancel.heldBalance - 25,
    );
    expect(walletAfterCancel.totalBalance).toBe(
      walletBeforeCancel.totalBalance - 5,
    );
    await continuationPage.goto(`/classes/${halfClass.id}`);
    await continuationPage
      .getByRole("button", { name: "Review withdrawal", exact: true })
      .click();
    await expect(
      cancellationReview.getByText("Fee: 9 Marks · Return: 35 Marks"),
    ).toBeVisible();
    await cancellationReview
      .getByRole("button", { name: "Confirm withdrawal", exact: true })
      .click();
    await expect(
      continuationPage.getByText("cancelled", { exact: true }),
    ).toBeVisible();
    const withdrawn = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: halfClass.id },
    );
    expect(withdrawn.enrollments[0]?.state).toBe("cancelled");
    expect(
      withdrawn.enrollments[0]?.allocations.every(
        (row) => row.state === "released",
      ),
    ).toBe(true);
  } finally {
    await friendContext?.close();
    await continuationContext?.close();
    await studentContext?.close();
    await friendApi.dispose();
    await studentApi.dispose();
    await adminApi.dispose();
  }
});

test("admin cancels a class with an exact future-hold return and retained student history", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  assertT05EnrollmentTarget();
  const adminApi = await createApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  const studentApi = await createApiContext(STUDENT_EMAIL, STUDENT_PASSWORD);
  const adminStorageState = await adminApi.storageState();
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const competitions = await rpc<{ id: string; isActive: boolean }[]>(
      adminApi,
      "admin/listCompetitionCatalog",
      { includeArchived: false },
    );
    const tutors = await rpc<{ user: { id: string; role: string } }[]>(
      adminApi,
      "adminTutor/listTutorProfiles",
      { status: "published", limit: 100, offset: 0 },
    );
    const competition = competitions.find((row) => row.isActive);
    const tutor = tutors.find((row) => row.user.role === "tutor");
    if (!competition || !tutor)
      throw new Error("Missing class cancellation fixture references");
    const suffix = randomUUID().slice(0, 8);
    testRunStartOffsetDays = Number.parseInt(suffix, 16) % 100_000;
    const adminClass = await createPublishedCohort(
      adminApi,
      { competitionId: competition.id, tutorId: tutor.user.id },
      { title: `T06 admin cancellation ${suffix}`, sessions: 2 },
    );
    const enrolled = await rpc<Enrollment & { outcome: string }>(
      studentApi,
      "classes/createEnrollment",
      { classId: adminClass.id, plan: "full", requestKey: randomUUID() },
    );
    expect(enrolled.outcome).toBe("confirmed");
    const before = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    await page.close();
    adminContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: adminStorageState,
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin-classes");
    const card = adminPage.getByTestId(`published-class-${adminClass.id}`);
    await card
      .getByRole("button", { name: "Manage class", exact: true })
      .click();
    await card
      .getByLabel("Class cancellation reason")
      .fill("Class cancellation browser acceptance");
    await card
      .getByRole("button", { name: "Review class cancellation", exact: true })
      .click();
    const review = card.getByRole("region", {
      name: "Admin class cancellation review",
    });
    await expect(
      review.getByText("Cancellation fee: 0 Marks · Return: 40 Marks"),
    ).toBeVisible();
    await review
      .getByRole("button", { name: "Confirm class cancellation", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    const after = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    expect(after.availableBalance).toBe(before.availableBalance + 40);
    expect(after.heldBalance).toBe(before.heldBalance - 40);
    expect(after.totalBalance).toBe(before.totalBalance);
    expect(
      (
        await rpc<AdminClass>(adminApi, "admin/getAcademyClass", {
          id: adminClass.id,
        })
      ).state,
    ).toBe("cancelled");
    const history = await rpc<{ enrollments: Enrollment[] }>(
      studentApi,
      "classes/getMyEnrollments",
      { classId: adminClass.id },
    );
    expect(history.enrollments[0]?.state).toBe("cancelled");
  } finally {
    await adminContext?.close();
    await studentApi.dispose();
    await adminApi.dispose();
  }
});

test("admin cancels one session, postpones once, and student confirms the exact free exit", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  assertT05EnrollmentTarget();
  const adminApi = await createApiContext(ADMIN_EMAIL, ADMIN_PASSWORD);
  const studentApi = await createApiContext(STUDENT_EMAIL, STUDENT_PASSWORD);
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let studentContext:
    | Awaited<ReturnType<typeof browser.newContext>>
    | undefined;
  try {
    const competitions = await rpc<{ id: string; isActive: boolean }[]>(
      adminApi,
      "admin/listCompetitionCatalog",
      { includeArchived: false },
    );
    const tutors = await rpc<{ user: { id: string; role: string } }[]>(
      adminApi,
      "adminTutor/listTutorProfiles",
      { status: "published", limit: 100, offset: 0 },
    );
    const competition = competitions.find((row) => row.isActive);
    const tutor = tutors.find((row) => row.user.role === "tutor");
    if (!competition || !tutor)
      throw new Error("Missing lifecycle browser fixture references");

    const suffix = randomUUID().slice(0, 8);
    testRunStartOffsetDays = Number.parseInt(suffix, 16) % 100_000;
    const academyClass = await createPublishedCohort(
      adminApi,
      { competitionId: competition.id, tutorId: tutor.user.id },
      {
        title: `T06 lifecycle ${suffix}`,
        sessions: 3,
        capacity: 2,
        minimumEnrollment: 2,
        minimumCheckAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    );
    const walletBefore = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    const enrollment = await rpc<Enrollment & { outcome: string }>(
      studentApi,
      "classes/createEnrollment",
      {
        classId: academyClass.id,
        plan: "half",
        requestKey: randomUUID(),
      },
    );
    expect(enrollment.outcome).toBe("confirmed");

    await page.close();
    await page.context().close();
    adminContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await adminApi.storageState(),
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin-classes");
    const card = adminPage.getByTestId(`published-class-${academyClass.id}`);
    await card
      .getByRole("button", { name: "Manage class", exact: true })
      .click();
    await expect(card).toBeVisible();
    await expect(
      card.getByText("1 / 2 active full/half students"),
    ).toBeVisible();
    await expect(card.getByText("Shortfall: 1")).toBeVisible();

    await card
      .getByRole("button", { name: "Review cancellation" })
      .first()
      .click();
    await card
      .getByLabel("Cancellation reason", { exact: true })
      .fill("Cancel the first future session for lifecycle acceptance");
    await card.getByRole("button", { name: "Preview exact return" }).click();
    const cancelReview = card.getByRole("region", {
      name: "Session cancellation review",
    });
    await expect(
      cancelReview.getByText(
        "Return: 22 Marks · Fee: 0 Marks · 1 seat allocation(s) released.",
      ),
    ).toBeVisible();
    await cancelReview
      .getByRole("button", { name: "Confirm session cancellation" })
      .click();
    await expect(
      adminPage.getByText("Class session cancelled", { exact: true }),
    ).toBeVisible();

    const refreshed = await rpc<{
      version: number;
      sessions: {
        id: string;
        sequenceNumber: number;
        startAt: string;
        state: string;
      }[];
    }>(adminApi, "admin/getAcademyClass", { id: academyClass.id });
    expect(refreshed.version).toBe(academyClass.version + 1);
    const replacements = refreshed.sessions
      .filter((session) => session.state === "scheduled")
      .map((session, index) => ({
        sessionId: session.id,
        sequenceNumber: session.sequenceNumber,
        startAt: new Date(
          new Date(session.startAt).getTime() + (30 + index * 7) * 86_400_000,
        ),
      }));
    for (const replacement of replacements) {
      await card
        .getByLabel(`Replacement start · session ${replacement.sequenceNumber}`)
        .fill(toDateTimeLocal(replacement.startAt));
    }
    await card
      .getByLabel("Decision reason")
      .fill("Postpone once to meet the minimum enrollment policy");
    await card
      .getByRole("button", { name: "Review one-time postponement" })
      .click();
    const postponeReview = card.getByRole("region", {
      name: "Minimum decision review",
    });
    await expect(
      postponeReview.getByText(
        "1 / 2 unique active full/half students · shortfall 1.",
      ),
    ).toBeVisible();
    await expect(
      postponeReview.getByText(/Free withdrawal deadline:/),
    ).toBeVisible();
    await postponeReview
      .getByRole("button", { name: "Confirm postpone" })
      .click();
    await expect(card.getByText("Postponed", { exact: true })).toBeVisible();

    const lifecycle = await rpc<{
      classState: string;
      freeExitUntil: string;
      enrollments: Enrollment[];
    }>(studentApi, "classes/getMyEnrollments", { classId: academyClass.id });
    expect(lifecycle.classState).toBe("postponed");
    expect(lifecycle.enrollments[0]?.id).toBe(enrollment.id);
    if (!lifecycle.freeExitUntil)
      throw new Error("The postponed cohort has no free-exit deadline");
    const freeExitUntil = new Date(lifecycle.freeExitUntil);
    const formattedFreeExitUntil = new Intl.DateTimeFormat("en", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(freeExitUntil);

    await adminContext.close();
    adminContext = undefined;
    studentContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await studentApi.storageState(),
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/classes/${academyClass.id}`);
    await expect(
      studentPage.getByText("Postponed once", { exact: true }),
    ).toBeVisible();
    await expect(
      studentPage.getByText(formattedFreeExitUntil, { exact: false }).first(),
    ).toBeVisible();
    await studentPage
      .getByRole("button", { name: "Review withdrawal" })
      .click();
    const withdrawalReview = studentPage.getByRole("region", {
      name: "Cancellation review",
    });
    await expect(
      withdrawalReview.getByText("Fee: 0 Marks · Return: 22 Marks"),
    ).toBeVisible();
    await expect(
      withdrawalReview.getByText(
        "No second-half payment will be triggered automatically.",
      ),
    ).toBeVisible();
    await expect(withdrawalReview.getByText(/fee-free through/)).toBeVisible();
    await expect(
      withdrawalReview.getByText(formattedFreeExitUntil, { exact: false }),
    ).toBeVisible();
    await withdrawalReview
      .getByRole("button", { name: "Confirm free withdrawal" })
      .click();
    await expect(
      studentPage.getByText("cancelled", { exact: true }),
    ).toBeVisible();

    const after = await rpc<{
      availableBalance: number;
      heldBalance: number;
      totalBalance: number;
    }>(studentApi, "wallet/get", {});
    expect(after.availableBalance).toBe(walletBefore.availableBalance);
    expect(after.heldBalance).toBe(walletBefore.heldBalance);
    expect(after.totalBalance).toBe(walletBefore.totalBalance);
    const noSecondCharge = await rpc<{ outcome: string }>(
      studentApi,
      "classes/paySecondInstallment",
      { enrollmentId: enrollment.id },
    );
    expect(noSecondCharge.outcome).toBe("expired");
  } finally {
    await studentContext?.close();
    await adminContext?.close();
    await studentApi.dispose();
    await adminApi.dispose();
  }
});
