import { and, eq, inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { booking } from "@cogito-app/db/schema";

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
) {
  assertOnDemandReportTestTarget(process.env);
  if (
    ![bookingId, tutorId, studentId].every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ),
    )
  ) {
    throw new Error(
      "On-demand report fixture movement requires UUID identities.",
    );
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
  const [bookingId, tutorId, studentId] = process.argv.slice(2);
  if (!bookingId || !tutorId || !studentId) {
    throw new Error(
      "Usage: move-on-demand-booking-report-past.ts <bookingId> <tutorId> <studentId>",
    );
  }
  moveOnDemandBookingReportPast(bookingId, tutorId, studentId)
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
