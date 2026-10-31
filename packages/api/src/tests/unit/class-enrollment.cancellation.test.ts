import { expect, test } from "bun:test";
import { quoteEnrollmentCancellation } from "../../modules/class-enrollment/class-enrollment.cancellation";

const now = new Date("2040-01-01T00:00:00Z");
function allocation(id: string, rateMarks: number) {
  return {
    id,
    sessionId: id,
    state: "funded" as const,
    rateMarks,
    fundedMarks: rateMarks,
    spentMarks: 0,
    releasedMarks: 0,
  };
}
function session(id: string, hours = 24) {
  return {
    id,
    state: "scheduled",
    startAt: new Date(now.getTime() + hours * 3600000),
  };
}
test.each([
  [20, 4, 16],
  [22, 4, 18],
  [25, 5, 20],
  [5, 1, 4],
])(
  "inclusive 24h boundary quotes %i Marks as %i charge + %i return",
  (marks, fee, returned) => {
    expect(
      quoteEnrollmentCancellation(
        "enrollment",
        [allocation("a", marks)],
        [session("a")],
        now,
        "a",
      ),
    ).toMatchObject({ feeMarks: fee, returnMarks: returned });
  },
);
test("withdrawal rounds once on remaining Marks and keeps late seats held", () => {
  const rows = Array.from({ length: 10 }, (_, i) => allocation(String(i), 22));
  const sessions = rows.map((row) => session(row.id, 48));
  const quote = quoteEnrollmentCancellation("e", rows, sessions, now);
  expect(quote).toMatchObject({ feeMarks: 44, returnMarks: 176 });
  expect(quote.allocations.reduce((sum, row) => sum + row.chargeMarks, 0)).toBe(
    44,
  );
  const late = quoteEnrollmentCancellation(
    "e",
    [allocation("late", 25)],
    [session("late", 23)],
    now,
  );
  expect(late).toMatchObject({ retainedMarks: 25, allocations: [] });
});
test("withdrawal cancels only unfunded reservations and does not charge them", () => {
  const unpaid = {
    ...allocation("u", 22),
    state: "unfunded_reserved" as const,
    fundedMarks: 0,
  };
  expect(
    quoteEnrollmentCancellation("e", [unpaid], [session("u")], now),
  ).toMatchObject({ feeMarks: 0, returnMarks: 0, unpaidAllocationIds: ["u"] });
  expect(() =>
    quoteEnrollmentCancellation("e", [unpaid], [session("u")], now, "u"),
  ).toThrow("Only funded seats");
});
test("72-hour postponement exit is free through the exact deadline only", () => {
  const row = allocation("a", 20);
  const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const atDeadline = quoteEnrollmentCancellation(
    "e",
    [row],
    [session("a", 120)],
    deadline,
    undefined,
    deadline,
  );
  expect(atDeadline).toMatchObject({
    scope: "withdrawal",
    freeExit: true,
    freeExitUntil: deadline,
    feeRateBps: 0,
    feeMarks: 0,
    returnMarks: 20,
  });
  const afterDeadline = quoteEnrollmentCancellation(
    "e",
    [row],
    [session("a", 120)],
    new Date(deadline.getTime() + 1),
    undefined,
    deadline,
  );
  expect(afterDeadline).toMatchObject({
    freeExit: false,
    freeExitUntil: null,
    feeRateBps: 2000,
    feeMarks: 4,
    returnMarks: 16,
  });
  const individualSeat = quoteEnrollmentCancellation(
    "e",
    [row],
    [session("a", 120)],
    now,
    "a",
    deadline,
  );
  expect(individualSeat).toMatchObject({
    scope: "session",
    freeExit: false,
    feeMarks: 4,
    returnMarks: 16,
  });
});
test("released/past/completed seats never return Marks; schedule changes invalidate quotes", () => {
  const row = allocation("a", 25);
  expect(
    quoteEnrollmentCancellation(
      "e",
      [{ ...row, state: "released", releasedMarks: 25 }],
      [session("a")],
      now,
    ).allocations,
  ).toEqual([]);
  expect(
    quoteEnrollmentCancellation("e", [row], [session("a", -1)], now)
      .allocations,
  ).toEqual([]);
  expect(
    quoteEnrollmentCancellation(
      "e",
      [row],
      [{ ...session("a"), state: "completed" }],
      now,
    ).allocations,
  ).toEqual([]);
  expect(
    quoteEnrollmentCancellation("e", [row], [session("a", 48)], now)
      .quoteVersion,
  ).not.toBe(
    quoteEnrollmentCancellation("e", [row], [session("a", 49)], now)
      .quoteVersion,
  );
});

test("session cancellation filters other seats and skips fully spent allocations", () => {
  const fullySpent = {
    ...allocation("spent", 20),
    spentMarks: 20,
  };
  const quote = quoteEnrollmentCancellation(
    "e",
    [allocation("selected", 20), allocation("other", 20), fullySpent],
    [session("selected"), session("other"), session("spent")],
    now,
    "selected",
  );

  expect(quote.allocations.map((item) => item.allocationId)).toEqual([
    "selected",
  ]);
  expect(quote.returnMarks).toBe(16);
});

test("rejects a withdrawal whose funded Marks total exceeds the safe range", () => {
  const maxSafeMarks = Number.MAX_SAFE_INTEGER;
  const first = {
    ...allocation("first", maxSafeMarks),
    fundedMarks: maxSafeMarks,
  };
  const second = {
    ...allocation("second", maxSafeMarks),
    fundedMarks: maxSafeMarks,
  };

  expect(() =>
    quoteEnrollmentCancellation(
      "e",
      [first, second],
      [session("first", 48), session("second", 48)],
      now,
    ),
  ).toThrow("Cancellation Marks exceed the supported range");
});

test("fully released funded allocations add no cancellation charge or return", () => {
  const row = { ...allocation("released", 20), releasedMarks: 20 };
  expect(
    quoteEnrollmentCancellation("e", [row], [session("released", 48)], now),
  ).toMatchObject({ feeMarks: 0, returnMarks: 0, allocations: [] });
});
