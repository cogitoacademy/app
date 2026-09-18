import { describe, test, expect } from "bun:test";
import {
  completeSessionInput,
  listCompletionFeedbackInput,
} from "../../modules/booking/booking.types";

describe("completion feedback input", () => {
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
});
