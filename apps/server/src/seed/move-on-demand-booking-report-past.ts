import { and, eq, inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { booking, user } from "@cogito-app/db/schema";

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_USER_ID = /^[A-Za-z0-9_-]{16,128}$/;
const RUN_SCOPED_STUDENT_EMAIL =
  /^cogito\.e2e\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@yopmail\.com$/i;
const SYNTHETIC_REPORT_GOAL =
  /^Synthetic on-demand admin report [0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertOnDemandReportTestTarget(env: NodeJS.ProcessEnv) {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("On-demand report fixture requires loopback test DB 6769.");
  }
  const host = url.hostname.toLowerCase();
  if (
    env.NODE_ENV !== "test" ||
    env.T07_ON_DEMAND_BOOKING_REPORTS_E2E !== "1" ||
    env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
    env.TEST_DATABASE_ALLOW_RESET !== undefined ||
    env.TEST_DATABASE_RESET_TARGET !== undefined ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) ||
    url.port !== "6769" ||
    url.pathname !== "/cogito-test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "On-demand report fixture movement requires the opt-in loopback 6769/cogito-test target.",
    );
  }
}

export async function moveOnDemandBookingReportPast(
  bookingId: string,
  tutorId: string,
  studentId: string,
  learningGoal: string,
) {
  assertOnDemandReportTestTarget(process.env);
  if (
    !BOOKING_UUID.test(bookingId) ||
    !AUTH_USER_ID.test(tutorId) ||
    !AUTH_USER_ID.test(studentId) ||
    !SYNTHETIC_REPORT_GOAL.test(learningGoal)
  ) {
    throw new Error(
      "On-demand report fixture movement requires a booking UUID, text auth IDs, and a synthetic test goal.",
    );
  }

  const studentEmail = process.env.E2E_STUDENT_EMAIL?.trim().toLowerCase();
  if (!studentEmail || !RUN_SCOPED_STUDENT_EMAIL.test(studentEmail)) {
    throw new Error(
      "On-demand report fixture movement requires a run-scoped E2E student.",
    );
  }
  const [runStudent] = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.id, studentId),
        eq(user.email, studentEmail),
        eq(user.role, "student"),
      ),
    )
    .limit(1);
  if (!runStudent) {
    throw new Error("The supplied student is not the run-scoped E2E student.");
  }

  const [tutor] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, tutorId), eq(user.role, "tutor")))
    .limit(1);
  if (!tutor) {
    throw new Error("The supplied booking tutor is not a tutor account.");
  }

  const now = new Date();
  const updated = await db
    .update(booking)
    .set({
      currentState: "scheduled",
      scheduledStartAt: new Date(now.getTime() - 2 * 60 * 60_000),
      scheduledEndAt: new Date(now.getTime() - 60 * 60_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(booking.id, bookingId),
        eq(booking.tutorId, tutorId),
        eq(booking.proposerId, studentId),
        eq(booking.learningGoal, learningGoal),
        eq(booking.type, "solo"),
        inArray(booking.currentState, ["scheduled", "confirmed"]),
      ),
    )
    .returning({ id: booking.id });
  if (updated.length !== 1) {
    throw new Error(
      "The owned scheduled solo report fixture was not found; no other booking was changed.",
    );
  }
}

if (import.meta.main) {
  const [bookingId, tutorId, studentId, learningGoal] = process.argv.slice(2);
  if (!bookingId || !tutorId || !studentId || !learningGoal) {
    throw new Error(
      "Usage: move-on-demand-booking-report-past.ts <bookingId> <tutorId> <studentId> <learningGoal>",
    );
  }
  moveOnDemandBookingReportPast(bookingId, tutorId, studentId, learningGoal)
    .then(() =>
      console.log("Owned on-demand booking report fixture moved to the past."),
    )
    .catch(() => {
      console.error(
        "On-demand report fixture movement failed; no non-test target is permitted.",
      );
      process.exit(1);
    });
}
