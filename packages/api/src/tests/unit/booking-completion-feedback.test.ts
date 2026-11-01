import { describe, test, expect } from "bun:test";
import {
  countFeedbackCharacters,
  normalizeFeedbackBullets,
} from "../../modules/booking/feedback-rules";
import {
  completeSessionInput,
  adminSubmitCompletionReportInput,
  listCompletionFeedbackInput,
} from "../../modules/booking/booking.types";
import {
  completionFeedbackEntitlementEventKeys,
  normalizeCompletionFeedback,
} from "../../modules/booking/booking.service";

const input = (discussion: string[]) => ({
  bookingId: "b1",
  feedback: { discussion, strengths: ["Good"], improvements: ["Practise"] },
});

describe("completion feedback input", () => {
  test("accepts 600 code points and rejects 601, including emoji", () => {
    for (const character of ["a", "😀"]) {
      expect(
        completeSessionInput.safeParse(input([character.repeat(600)])).success,
      ).toBe(true);
      expect(
        completeSessionInput.safeParse(input([character.repeat(601)])).success,
      ).toBe(false);
    }
  });

  test("counts the entire field including separators, not each bullet", () => {
    expect(
      completeSessionInput.safeParse(input(["a".repeat(299), "b".repeat(300)]))
        .success,
    ).toBe(true);
    expect(
      completeSessionInput.safeParse(input(["a".repeat(300), "b".repeat(300)]))
        .success,
    ).toBe(false);
    expect(countFeedbackCharacters(["• abc\r\n• def", " "])).toBe(7);
    expect(normalizeFeedbackBullets([" • First \r\n\r\n • Second "])).toEqual([
      "First",
      "Second",
    ]);
  });

  test("normalizes CRLF, prefixes and empty lines identically for API and UI", () => {
    const raw = [" • First \r\n\r\n • Second "];
    const parsed = completeSessionInput.parse(input(raw));
    expect(parsed.feedback.discussion).toEqual(normalizeFeedbackBullets(raw));
    expect(
      completeSessionInput.safeParse(input(["• ", " \r\n "])).success,
    ).toBe(false);
  });

  test("never silently drops bullets after the old 30-line limit", () => {
    const bullets = Array.from({ length: 31 }, (_, index) => `Point ${index}`);
    expect(
      completeSessionInput.parse(input(bullets)).feedback.discussion,
    ).toHaveLength(31);
  });

  test("stores feedback as canonical plaintext and keeps the 600-codepoint limit", () => {
    const feedback = {
      discussion: [
        "A & B",
        "A < B > C",
        "\"quoted\" 'quoted'",
        "literal &amp;",
      ],
      strengths: ["😀".repeat(600)],
      improvements: ["Practice"],
    };
    expect(normalizeCompletionFeedback("b1", feedback)).toEqual(feedback);
    expect(() =>
      normalizeCompletionFeedback("b1", {
        ...feedback,
        strengths: ["😀".repeat(601)],
      }),
    ).toThrow("at most 600 characters");
  });

  test("rejects missing feedback", () => {
    const r = completeSessionInput.safeParse({ bookingId: "b1" });
    expect(r.success).toBe(false);
  });

  test("rejects empty bullet lists", () => {
    const r = completeSessionInput.safeParse({
      bookingId: "b1",
      feedback: { discussion: [], strengths: ["x"], improvements: ["y"] },
    });
    expect(r.success).toBe(false);
  });

  test("accepts 3 bullet lists", () => {
    const r = completeSessionInput.safeParse({
      bookingId: "b1",
      sessionId: "s1",
      feedback: {
        discussion: ["Discussed fractions"],
        strengths: ["Fast grasp"],
        improvements: ["Practice word problems"],
      },
    });
    expect(r.success).toBe(true);
  });

  test("list input requires bookingId", () => {
    expect(listCompletionFeedbackInput.safeParse({}).success).toBe(false);
    expect(
      listCompletionFeedbackInput.safeParse({ bookingId: "b1" }).success,
    ).toBe(true);
  });

  test("admin submission shares the 600-codepoint field limit and audits delivery", () => {
    const adminInput = {
      bookingId: "booking-1",
      feedback: {
        discussion: ["😀".repeat(600)],
        strengths: ["Clear explanation"],
        improvements: ["Practise one more example"],
      },
      deliveryConfirmed: true,
      reason: "Correct the saved report",
      requestKey: "d943e1b2-88e6-47a5-9f39-275c0e9db17a",
    };
    expect(adminSubmitCompletionReportInput.safeParse(adminInput).success).toBe(
      true,
    );
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        reason: "😀".repeat(600),
      }).success,
    ).toBe(true);
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        feedback: {
          ...adminInput.feedback,
          discussion: ["😀".repeat(601)],
        },
      }).success,
    ).toBe(false);
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        reason: "  ",
      }).success,
    ).toBe(false);
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        reason: "😀".repeat(601),
      }).success,
    ).toBe(false);
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        deliveryConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      adminSubmitCompletionReportInput.safeParse({
        ...adminInput,
        requestKey: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  test("Q06 entitlement keys bind each report to its chargeable booking seat", () => {
    expect(
      completionFeedbackEntitlementEventKeys({
        bookingId: "solo-1",
        bookingType: "solo",
        userId: "student-1",
      }),
    ).toEqual([
      "booking.solo-1.deduct",
      "booking.solo-1.no_show.student-1.solo",
      "booking.solo-1.no_show.student-1",
    ]);
    expect(
      completionFeedbackEntitlementEventKeys({
        bookingId: "group-1",
        bookingType: "group",
        userId: "student-1",
      }),
    ).toEqual([
      "booking.group-1.complete.student-1",
      "booking.group-1.no_show.student-1.solo",
    ]);
    expect(
      completionFeedbackEntitlementEventKeys({
        bookingId: "series-1",
        bookingType: "series",
        seriesTargetGroupSize: 1,
        sessionId: "session-1",
        userId: "student-1",
      }),
    ).toEqual([
      "booking.series-1.session.session-1.deduct",
      "booking.series-1.no_show.student-1.session-1",
    ]);
    expect(
      completionFeedbackEntitlementEventKeys({
        bookingId: "group-series-1",
        bookingType: "series",
        seriesTargetGroupSize: 2,
        sessionId: "session-1",
        userId: "student-1",
      }),
    ).toEqual([
      "booking.group-series-1.session.session-1.deduct.student-1",
      "booking.group-series-1.no_show.student-1.session-1",
    ]);
  });
});
