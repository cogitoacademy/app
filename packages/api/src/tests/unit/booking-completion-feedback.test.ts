import { describe, test, expect } from "bun:test";
import {
  countFeedbackCharacters,
  normalizeFeedbackBullets,
} from "../../modules/booking/feedback-rules";
import {
  completeSessionInput,
  listCompletionFeedbackInput,
} from "../../modules/booking/booking.types";

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
