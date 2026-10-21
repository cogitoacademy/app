import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { TUTOR_EMAIL } from "../fixtures/test-accounts";

type TutorListRow = {
  id: string;
  userId: string;
  user: { id: string; email: string; role: string };
};

type TutorProfile = {
  id: string;
  userId: string;
  subjects: Array<{ id: string; isSelectable: boolean }>;
  availabilitySlots: Array<{
    id: string;
    startDate: string;
    endDate: string;
    modality: string;
  }>;
};

type WalletSnapshot = {
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
};

function assertOnDemandReportE2eTarget() {
  let dbUrl: URL;
  let redisUrl: URL;
  let serverUrl: URL;
  let webUrl: URL;
  try {
    dbUrl = new URL(process.env.DATABASE_URL ?? "");
    redisUrl = new URL(process.env.REDIS_URL ?? "");
    serverUrl = new URL(process.env.SERVER_URL ?? "");
    webUrl = new URL(process.env.WEB_URL ?? "");
  } catch {
    throw new Error(
      "On-demand booking report E2E requires its exact loopback test targets.",
    );
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.T07_ON_DEMAND_BOOKING_REPORTS_E2E !== "1" ||
    process.env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
    process.env.T05_ENROLLMENT_TEST_REDIS_PORT !== "6381" ||
    process.env.T05_ENROLLMENT_TEST_SERVER_PORT !== "3201" ||
    process.env.T05_ENROLLMENT_TEST_WEB_PORT !== "3200" ||
    process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
    process.env.TEST_DATABASE_RESET_TARGET !== undefined ||
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
      "On-demand booking report E2E requires opt-in NODE_ENV=test, exact loopback 6769/cogito-test, Redis 6381, API 3201, web 3200, and no reset overrides.",
    );
  }
}

async function createApiContext(role: "admin" | "student" | "tutor") {
  return request.newContext({
    baseURL: process.env.SERVER_URL ?? "http://localhost:3201",
    storageState: path.resolve(process.cwd(), ".auth", `${role}.json`),
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

function moveBookingPast(
  bookingId: string,
  tutorId: string,
  studentId: string,
) {
  const serverDir = path.resolve(process.cwd(), "../../apps/server");
  execFileSync(
    "bun",
    [
      "run",
      "src/seed/move-on-demand-booking-report-past.ts",
      bookingId,
      tutorId,
      studentId,
    ],
    { cwd: serverDir, env: process.env, stdio: "pipe" },
  );
}

function chooseSessionStart(profile: TutorProfile) {
  const earliest = Date.now() + 60 * 60_000;
  for (const slot of profile.availabilitySlots) {
    if (slot.modality !== "online" && slot.modality !== "both") continue;
    const startAt =
      Math.ceil(
        Math.max(earliest, new Date(slot.startDate).getTime()) / (30 * 60_000),
      ) *
      30 *
      60_000;
    if (startAt + 90 * 60_000 <= new Date(slot.endDate).getTime()) {
      return { slotId: slot.id, scheduledStartAt: new Date(startAt) };
    }
  }
  throw new Error("The seeded tutor has no future 90-minute online slot.");
}

test("admin records and corrects an on-demand booking report through the RPC-backed detail screen", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  assertOnDemandReportE2eTarget();
  const adminApi = await createApiContext("admin");
  const studentApi = await createApiContext("student");
  const tutorApi = await createApiContext("tutor");
  let adminContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const [students, tutorRows] = await Promise.all([
      rpc<{ user: { id: string } }>(studentApi, "auth/me", {}),
      rpc<TutorListRow[]>(adminApi, "adminTutor/listTutorProfiles", {
        status: "published",
        limit: 100,
        offset: 0,
      }),
    ]);
    const tutor = tutorRows.find(
      (row) =>
        row.user.role === "tutor" &&
        row.user.email.toLowerCase() === TUTOR_EMAIL.toLowerCase(),
    );
    if (!tutor)
      throw new Error("The seeded on-demand report tutor is missing.");
    const profile = await rpc<TutorProfile>(studentApi, "tutors/getProfile", {
      tutorId: tutor.id,
    });
    const slot = chooseSessionStart(profile);
    const subjectId = profile.subjects.find(
      (subject) => subject.isSelectable,
    )?.id;
    const booking = await rpc<{ id: string }>(
      studentApi,
      "booking/createSolo",
      {
        tutorId: tutor.userId,
        availabilitySlotId: slot.slotId,
        modality: "online",
        scheduledStartAt: slot.scheduledStartAt.toISOString(),
        subjectId,
        learningGoal: `Synthetic on-demand admin report ${randomUUID()}`,
        timezone: "Asia/Jakarta",
      },
    );
    await rpc(tutorApi, "tutorActions/acceptBooking", {
      bookingId: booking.id,
    });
    moveBookingPast(booking.id, tutor.userId, students.user.id);

    const walletBeforeReport = await rpc<WalletSnapshot>(
      studentApi,
      "wallet/get",
      {},
    );
    adminContext = await browser.newContext({
      baseURL: process.env.WEB_URL ?? "http://localhost:3200",
      storageState: await adminApi.storageState(),
    });
    const page = await adminContext.newPage();
    await page.goto(`/admin-operations/bookings/${booking.id}`);
    const recordButton = page.getByRole("button", {
      name: "Record report",
      exact: true,
    });
    await expect(recordButton).toBeVisible();
    await recordButton.click();
    await page
      .getByRole("textbox", { name: "Session discussion" })
      .fill("Reviewed the learner's opening approach");
    await page
      .getByRole("textbox", { name: "Strengths observed" })
      .fill("Explained the first step clearly");
    await page
      .getByRole("textbox", { name: "Areas for improvement" })
      .fill("Practise one more worked example");
    await page
      .getByRole("checkbox", { name: "I confirm this session was delivered." })
      .check();
    await page
      .getByRole("textbox", { name: "Audit reason" })
      .fill("Record the report after confirming delivery with the tutor");
    await page.getByRole("button", { name: "Save report" }).click();
    await expect(page.getByText("Session report recorded")).toBeVisible();
    await expect(page.getByText(/^Version 1 ·/).first()).toBeVisible();

    const reportsV1 = await rpc<
      Array<{ id: string; version: number; authorId: string }>
    >(adminApi, "booking/listCompletionFeedback", { bookingId: booking.id });
    expect(reportsV1).toHaveLength(1);
    expect(reportsV1[0]?.version).toBe(1);
    expect(reportsV1[0]?.authorId).toBe(tutor.userId);
    const walletAfterSubmit = await rpc<WalletSnapshot>(
      studentApi,
      "wallet/get",
      {},
    );
    expect(walletAfterSubmit.heldBalance).toBe(0);
    expect(walletAfterSubmit.totalBalance).toBeLessThan(
      walletBeforeReport.totalBalance,
    );

    await page.getByRole("button", { name: "Correct report" }).click();
    await page
      .getByRole("textbox", { name: "Areas for improvement" })
      .fill("Add a worked example to the next session");
    await page
      .getByRole("checkbox", { name: "I confirm this session was delivered." })
      .check();
    await page
      .getByRole("textbox", { name: "Audit reason" })
      .fill("Clarify the next practice step");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Session report corrected")).toBeVisible();
    await expect(page.getByText(/^Version 2 ·/).first()).toBeVisible();

    const reportsV2 = await rpc<
      Array<{ id: string; version: number; authorId: string }>
    >(adminApi, "booking/listCompletionFeedback", { bookingId: booking.id });
    expect(reportsV2[0]).toMatchObject({
      id: reportsV1[0]?.id,
      version: 2,
      authorId: tutor.userId,
    });
    const walletAfterCorrection = await rpc<WalletSnapshot>(
      studentApi,
      "wallet/get",
      {},
    );
    expect(walletAfterCorrection).toEqual(walletAfterSubmit);
    await page.getByText("Report history (2)").click();
    await expect(
      page.getByText("Clarify the next practice step"),
    ).toBeVisible();
  } finally {
    await Promise.allSettled([
      adminContext?.close(),
      studentApi.dispose(),
      tutorApi.dispose(),
      adminApi.dispose(),
    ]);
  }
});
