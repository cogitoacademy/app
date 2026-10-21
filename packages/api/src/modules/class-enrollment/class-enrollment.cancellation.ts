import { createHash } from "node:crypto";
import type { EnrollmentAllocationFunding } from "./class-enrollment.funding";
import { remainingAllocationMarks } from "./class-enrollment.funding";
import { ClassEnrollmentInvalidOperationError } from "./class-enrollment.errors";

type Allocation = EnrollmentAllocationFunding & {
  id: string;
  sessionId: string;
};
type Session = { id: string; state: string; startAt: Date };

// The boundary is inclusive. A later funded seat remains held for delivery/report.
export function quoteEnrollmentCancellation(
  enrollmentId: string,
  allocations: readonly Allocation[],
  sessions: readonly Session[],
  now: Date,
  sessionId?: string,
) {
  const selected = [];
  let retainedMarks = 0;
  let fundedMarks = 0;
  let feeMarks = 0;
  for (const allocation of allocations.toSorted((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (sessionId && allocation.sessionId !== sessionId) continue;
    if (allocation.state === "released") continue;
    const session = sessions.find((item) => item.id === allocation.sessionId);
    if (!session || session.state !== "scheduled" || session.startAt <= now)
      continue;
    const remaining = remainingAllocationMarks(allocation);
    const deadline = new Date(session.startAt.getTime() - 24 * 60 * 60 * 1000);
    if (remaining > 0 && now > deadline) {
      retainedMarks += remaining;
      continue;
    }
    if (allocation.state !== "funded") {
      if (!sessionId) continue;
      throw new ClassEnrollmentInvalidOperationError(
        "Only funded seats can be cancelled individually; withdraw to stop the unpaid installment",
      );
    }
    if (remaining === 0) continue;
    fundedMarks += remaining;
    if (!Number.isSafeInteger(fundedMarks))
      throw new ClassEnrollmentInvalidOperationError(
        "Cancellation Marks exceed the supported range",
      );
    const cumulativeFee = Number(
      (BigInt(fundedMarks) * 2000n + 5000n) / 10000n,
    );
    selected.push({
      allocationId: allocation.id,
      sessionId: allocation.sessionId,
      deadline,
      chargeMarks: cumulativeFee - feeMarks,
      returnMarks: remaining - (cumulativeFee - feeMarks),
    });
    feeMarks = cumulativeFee;
  }
  const unpaid = sessionId
    ? []
    : allocations
        .filter((allocation) => allocation.state === "unfunded_reserved")
        .map((allocation) => allocation.id)
        .toSorted();
  // Unfunded reservations are removed only by whole-plan withdrawal. Their
  // immutable rate/session snapshot remains in history, with the invoice cancelled.
  const quote = {
    enrollmentId,
    sessionId: sessionId ?? null,
    scope: sessionId ? ("session" as const) : ("withdrawal" as const),
    feeRateBps: 2000,
    feeMarks,
    returnMarks: fundedMarks - feeMarks,
    retainedMarks,
    allocations: selected,
    unpaidAllocationIds: unpaid,
  };
  return {
    ...quote,
    quoteVersion: createHash("sha256")
      .update(JSON.stringify(quote))
      .digest("hex"),
  };
}

export type EnrollmentCancellationQuote = ReturnType<
  typeof quoteEnrollmentCancellation
>;
