import { describe, expect, test } from "bun:test";
import { quoteClassEnrollment } from "../../modules/class-enrollment/enrollment.pricing";

const now = new Date("2026-10-21T00:00:00.000Z");
const rates = {
  cohortFullRateMarks: 20,
  cohortHalfRateMarks: 22,
  cohortSingleRateMarks: 25,
  masterclassRateMarks: 5,
};

function sessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index + 1}`,
    sequenceNumber: index + 1,
    startAt: new Date(now.getTime() + (index + 1) * 24 * 60 * 60 * 1000),
    state: "scheduled",
  }));
}

describe("class enrollment pricing [REQ-ENROLL-01/04]", () => {
  test("AC-N02: full 16 holds 320 Marks and snapshots each session at 20", () => {
    const quote = quoteClassEnrollment({
      kind: "cohort",
      plan: "full",
      rates,
      sessions: sessions(16),
      now,
    });

    expect(quote.totalMarks).toBe(320);
    expect(quote.firstInstallmentMarks).toBe(320);
    expect(quote.secondInstallmentMarks).toBe(0);
    expect(quote.allocations).toHaveLength(16);
    expect(quote.allocations.every((item) => item.rateMarks === 20)).toBe(true);
  });

  test("AC-N02: half 16 is 176 now and 176 at session 9", () => {
    const quote = quoteClassEnrollment({
      kind: "cohort",
      plan: "half",
      rates,
      sessions: sessions(16),
      now,
    });

    expect(quote.firstInstallmentMarks).toBe(176);
    expect(quote.secondInstallmentMarks).toBe(176);
    expect(quote.installments[1]?.dueAt).toEqual(sessions(16)[8]?.startAt);
    expect(
      quote.allocations
        .slice(0, 8)
        .every((item) => item.installmentOrdinal === 1),
    ).toBe(true);
    expect(
      quote.allocations.slice(8).every((item) => item.installmentOrdinal === 2),
    ).toBe(true);
  });

  test("AC-N02: odd 15 and late-join 7 split with ceil/floor", () => {
    const odd = quoteClassEnrollment({
      kind: "cohort",
      plan: "half",
      rates,
      sessions: sessions(15),
      now,
    });
    const late = quoteClassEnrollment({
      kind: "cohort",
      plan: "half",
      rates,
      sessions: sessions(7),
      now,
    });

    expect([odd.firstInstallmentMarks, odd.secondInstallmentMarks]).toEqual([
      176, 154,
    ]);
    expect([late.firstInstallmentMarks, late.secondInstallmentMarks]).toEqual([
      88, 66,
    ]);
  });

  test("R=1 creates one non-empty installment only", () => {
    const quote = quoteClassEnrollment({
      kind: "cohort",
      plan: "half",
      rates,
      sessions: sessions(1),
      now,
    });

    expect(quote.firstInstallmentMarks).toBe(22);
    expect(quote.secondInstallmentMarks).toBe(0);
    expect(quote.installments).toHaveLength(1);
    expect(quote.allocations[0]?.installmentOrdinal).toBe(1);
  });

  test("AC-N02: single and masterclass use current admin rates", () => {
    const single = quoteClassEnrollment({
      kind: "cohort",
      plan: "single",
      sessionId: "session-1",
      rates,
      sessions: sessions(2),
      now,
    });
    const masterclass = quoteClassEnrollment({
      kind: "masterclass",
      plan: "masterclass",
      rates,
      sessions: sessions(1),
      now,
    });

    expect(single.totalMarks).toBe(25);
    expect(masterclass.totalMarks).toBe(5);
  });

  test("excludes past/cancelled sessions and honors edited class rates", () => {
    const quote = quoteClassEnrollment({
      kind: "cohort",
      plan: "half",
      rates: { ...rates, cohortHalfRateMarks: 30 },
      sessions: [
        ...sessions(2),
        {
          id: "past",
          sequenceNumber: 0,
          startAt: new Date(now.getTime() - 1),
          state: "scheduled",
        },
        {
          id: "cancelled",
          sequenceNumber: 3,
          startAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
          state: "cancelled",
        },
      ],
      now,
    });

    expect(quote.selectedSessionIds).toEqual(["session-1", "session-2"]);
    expect([quote.firstInstallmentMarks, quote.secondInstallmentMarks]).toEqual(
      [30, 30],
    );
    expect(quote.firstRateMarks).toBe(30);
    expect(quote.secondRateMarks).toBe(30);
  });
});
