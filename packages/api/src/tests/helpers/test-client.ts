import { createRouterClient } from "@orpc/server";
import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { eq } from "drizzle-orm";

import { appRouter, type AppRouter } from "../../routers";
import { services } from "../../services";

export type TestClient = ReturnType<typeof createTestClient>;

export async function createTestContext(sessionCookie?: string) {
  const headers = new Headers();
  if (sessionCookie) headers.set("cookie", sessionCookie);
  const session = await auth.api.getSession({ headers });
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
  await auth.api.signUpEmail({
    body: { email, password, name },
    headers: new Headers(),
  });

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
  await db.execute(
    `TRUNCATE TABLE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
  await seedMarkPackages();
}

async function seedMarkPackages() {
  const { markPackage } = await import("@cogito-app/db/schema");
  await db
    .insert(markPackage)
    .values([
      { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 430000 },
      { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 990000 },
      {
        code: "explorer",
        name: "Explorer Pack",
        marks: 200,
        priceIdr: 1570000,
      },
      { code: "pioneer", name: "Pioneer Pack", marks: 300, priceIdr: 2180000 },
    ])
    .onConflictDoNothing({ target: markPackage.code });
}
