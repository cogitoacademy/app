import { createRouterClient } from "@orpc/server";
import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { economyConfig, user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";

import { appRouter, type AppRouter } from "../../routers";
import { services } from "../../services";

function getDatabaseName(databaseUrl: string | undefined) {
  if (!databaseUrl) return "";

  try {
    return new URL(databaseUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function assertSafeTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  const databaseName = getDatabaseName(databaseUrl);

  if (
    process.env.NODE_ENV !== "test" ||
    !databaseName.toLowerCase().includes("test")
  ) {
    throw new Error(
      [
        "resetDatabase() is blocked outside a dedicated test database.",
        `NODE_ENV='${process.env.NODE_ENV ?? ""}', DATABASE_URL database='${databaseName}'.`,
      ].join(" "),
    );
  }
}

export type TestClient = ReturnType<typeof createTestClient>;

export async function createTestContext(sessionCookie?: string) {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", sessionCookie);
  const session = await auth.api.getSession({ headers });
  if (session?.user) {
    const currentUser = await db.query.user.findFirst({
      columns: { role: true, emailVerified: true },
      where: eq(user.id, session.user.id),
    });
    if (currentUser) {
      session.user.role = currentUser.role;
      session.user.emailVerified = currentUser.emailVerified;
    }
  }
  return { session, services, headers };
}

export function createTestClient(
  context: Awaited<ReturnType<typeof createTestContext>>,
) {
  return createRouterClient<AppRouter>(appRouter, { context });
}

export async function signUpAndSignIn(
  email: string,
  password: string,
  name: string,
) {
  const res = await signUpAndSignInUnverified(email, password, name);
  // The email-verification gate (verifiedStudentProcedure) requires
  // emailVerified=true for paid actions; most integration tests sign up and
  // immediately use paid procedures, so the default helper marks users
  // verified. Tests exercising the gate itself use signUpAndSignInUnverified.
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email));
  return res;
}

export async function signUpAndSignInUnverified(
  email: string,
  password: string,
  name: string,
) {
  await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
  });

  // Deliberately NO emailVerified update here — this helper exists for the
  // email-verification gate tests, which must exercise genuinely unverified
  // users. (A merged commit accidentally added the verified-marking inside
  // this helper, silently disabling the gate tests on main.)
  const response = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });

  const setCookie = response.headers.getSetCookie();
  const sessionCookie = setCookie.find((c: string) =>
    c.includes("better-auth.session_token"),
  );
  return { cookie: sessionCookie?.split(";")[0] ?? "" };
}

export async function setUserRole(userId: string, role: string) {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

const TRUNCATE_TABLES = [
  "booking_state_history",
  "booking_participant",
  "booking_reschedule_proposal",
  "booking_session",
  "session_note",
  "booking",
  "notification_dispatch",
  "notification",
  "payment_record",
  "refund_record",
  "ledger_entry",
  "availability_slot",
  "meeting_event",
  "room_booking",
  "room",
  "tutor_profile",
  "tutor_invite",
  "wallet",
  "achievement",
  "audit_log",
  "support_ticket",
  "student_profile",
  "mark_package",
  "account",
  "session",
  "verification",
  "user",
];

export async function resetDatabase() {
  assertSafeTestDatabase();
  await db.execute(
    `TRUNCATE TABLE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
  await seedMarkPackages();
  await db.update(economyConfig).set({
    markValueIdr: 5_000,
    minTutorBaseRateIdr: 50_000,
    onlineTutorIncrementIdr: 30_000,
    offlineTutorIncrementIdr: 40_000,
    onlineCogitoBaseIdr: 50_000,
    onlineCogitoIncrementIdr: 20_000,
    offlineCogitoBaseIdr: 90_000,
    offlineCogitoIncrementIdr: 40_000,
    version: 1,
    updatedBy: null,
  });
}

async function seedMarkPackages() {
  const { markPackage } = await import("@cogito-app/db/schema");
  await db
    .insert(markPackage)
    .values([
      { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 312500 },
      { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 690000 },
      {
        code: "explorer",
        name: "Explorer Pack",
        marks: 200,
        priceIdr: 1070000,
      },
      { code: "pioneer", name: "Pioneer Pack", marks: 400, priceIdr: 2000000 },
    ])
    .onConflictDoNothing({ target: markPackage.code });
}
