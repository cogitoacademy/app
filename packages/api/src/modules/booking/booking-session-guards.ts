import { SESSION_DURATION_MS } from "../../shared/constants";
import {
  BookingConflictError,
  BookingNotEditableError,
} from "./booking.errors";

/**
 * Session scheduling guards — pure helpers, no DB, no ports, no side
 * effects. Moved verbatim from `booking.service.ts` (mechanical extraction,
 * no logic edits) so the closure-heavy factory stays readable and these
 * stay unit-testable in isolation.
 */

export function normalizeSession(startAt: Date) {
  return {
    scheduledStartAt: startAt,
    scheduledEndAt: new Date(startAt.getTime() + SESSION_DURATION_MS),
  };
}

export function assertSessionFitsAvailability(
  slot: { startDate: Date; endDate: Date; modality: string },
  session: { scheduledStartAt: Date; scheduledEndAt: Date },
  modality: "online" | "offline",
) {
  const supportsModality =
    slot.modality === "both" || slot.modality === modality;
  if (
    !supportsModality ||
    session.scheduledStartAt < slot.startDate ||
    session.scheduledEndAt > slot.endDate
  ) {
    throw new BookingNotEditableError(
      "The 90-minute session must fit inside the tutor availability window",
    );
  }
}

export function assertNoIntraSeriesOverlap(
  sessions: { scheduledStartAt: Date; scheduledEndAt: Date }[],
): void {
  const sorted = [...sessions].toSorted(
    (a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.scheduledStartAt.getTime() < prev.scheduledEndAt.getTime()) {
      throw new BookingConflictError(
        "series",
        prev.scheduledEndAt.toISOString(),
        curr.scheduledStartAt.toISOString(),
      );
    }
  }
}
