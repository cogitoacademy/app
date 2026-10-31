import { createRouterClient } from "@orpc/server";
import { auth } from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import {
  economyV3Activation,
  economyV3Revision,
  markPackage,
  subjectCategory,
  tutorProfile,
  tutorProfileSubject,
  user,
} from "@cogito-app/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";
import { appRouter } from "../../routers";
import { services } from "../../services";
import {
  assertSafeTestDatabaseUrl,
  assertTestDatabaseResetAllowed,
} from "./test-database-safety";

export function assertSafeTestDatabase() {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
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
  const client = createRouterClient(appRouter, { context });
  const creationMethods = new Set([
    "createSolo",
    "createGroup",
    "createSeries",
    "createGroupSeries",
  ]);

  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "booking" || !value) return value;
      return new Proxy(value, {
        get(bookingTarget, bookingProperty, bookingReceiver) {
          const method = Reflect.get(
            bookingTarget,
            bookingProperty,
            bookingReceiver,
          );
          if (
            typeof method !== "function" ||
            !creationMethods.has(String(bookingProperty))
          ) {
            return method;
          }
          return async (input: Record<string, unknown>) => {
            if (input.subjectId || typeof input.tutorId !== "string") {
              return method(input);
            }
            const subjectId = await ensureTestTutorSubject(input.tutorId);
            return method({ ...input, subjectId });
          };
        },
      });
    },
  }) as typeof client;
}

export async function ensureTestTutorSubject(tutorId: string) {
  const profile = await db.query.tutorProfile.findFirst({
    columns: { id: true },
    where: eq(tutorProfile.userId, tutorId),
  });

  let assigned: { subjectId: string }[] = [];
  if (profile) {
    assigned = await db
      .select({ subjectId: tutorProfileSubject.subjectId })
      .from(tutorProfileSubject)
      .innerJoin(
        subjectCategory,
        eq(tutorProfileSubject.subjectId, subjectCategory.id),
      )
      .where(
        and(
          eq(tutorProfileSubject.tutorProfileId, profile.id),
          eq(subjectCategory.isActive, true),
          isNotNull(subjectCategory.parentId),
        ),
      )
      .limit(1);
  }
  if (assigned[0]) return assigned[0].subjectId;

  const [subject] = await db
    .select({ id: subjectCategory.id })
    .from(subjectCategory)
    .where(
      and(
        eq(subjectCategory.isActive, true),
        isNotNull(subjectCategory.parentId),
        eq(subjectCategory.slug, "competition-debate-law"),
      ),
    )
    .limit(1);
  if (!subject) throw new Error("V3 test specialization seed is missing");

  if (!profile) return subject.id;

  await db
    .insert(tutorProfileSubject)
    .values({ tutorProfileId: profile.id, subjectId: subject.id })
    .onConflictDoNothing();
  return subject.id;
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
  "economy_v3_top_up_quote",
  "economy_v3_activation",
  "economy_v3_revision",
  "academy_class_session",
  "academy_class",
  "tutor_payout_allocation",
  "tutor_payout",
  "tutor_session_fee",
  "booking_state_history",
  "contact_request",
  "booking_participant",
  "booking_reschedule_proposal",
  "booking_session",
  "session_note",
  "session_completion_feedback",
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
  "knowledge_bank_access_grant",
  "student_profile",
  "mark_package",
  "account",
  "session",
  "verification",
  "user",
];

export async function resetDatabase() {
  assertSafeTestDatabaseUrl(process.env.DATABASE_URL, process.env.NODE_ENV);
  assertTestDatabaseResetAllowed(
    process.env.DATABASE_URL,
    process.env.NODE_ENV,
    process.env.TEST_DATABASE_ALLOW_RESET,
    process.env.TEST_DATABASE_RESET_TARGET,
  );
  const taxonomy = await db.select().from(subjectCategory);
  await db.execute(
    `TRUNCATE TABLE ${TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
  const taxonomyParents = taxonomy.filter((entry) => entry.parentId === null);
  const taxonomySpecializations = taxonomy.filter(
    (entry) => entry.parentId !== null,
  );
  if (taxonomyParents.length) {
    await db
      .insert(subjectCategory)
      .values(taxonomyParents)
      .onConflictDoNothing({ target: subjectCategory.id });
  }
  if (taxonomySpecializations.length) {
    await db
      .insert(subjectCategory)
      .values(taxonomySpecializations)
      .onConflictDoNothing({ target: subjectCategory.id });
  }
  await seedMarkPackages();
  await db.insert(economyV3Revision).values({
    version: 1,
    values: DEFAULT_V3_ECONOMY_CONFIG,
    reason: "Reset V3 economy defaults for isolated tests",
    createdBy: null,
  });
  await db.insert(economyV3Activation).values({
    id: "default",
    activeRevision: 1,
    updatedBy: null,
  });
}

async function seedMarkPackages() {
  const packageNames: Record<string, string> = {
    starter: "Starter Pack",
    learner: "Learner Pack",
    explorer: "Explorer Pack",
    pioneer: "Pioneer Pack",
  };
  await db
    .insert(markPackage)
    .values(
      DEFAULT_V3_ECONOMY_CONFIG.packages.map((pkg) => ({
        code: pkg.code,
        marks: pkg.marks,
        priceIdr: pkg.priceIdr,
        name: packageNames[pkg.code] ?? pkg.code,
      })),
    )
    .onConflictDoNothing({ target: markPackage.code });
}
