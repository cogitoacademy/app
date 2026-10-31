import { expect, test } from "bun:test";
import { listPublishedInput } from "../../modules/tutor-discovery/discovery.types";
import { cancelSeriesSessionInput } from "../../modules/admin-booking/admin-booking.types";
import { rescheduleAcademyClassSessionInput } from "../../modules/academy-class/academy-class.types";

test("academy rescheduling requires an end after the start", () => {
  const input = {
    sessionId: crypto.randomUUID(),
    expectedVersion: 1,
    startAt: "2040-01-01T10:00:00Z",
    endAt: "2040-01-01T11:00:00Z",
    reason: "Schedule update",
  };
  expect(rescheduleAcademyClassSessionInput.safeParse(input).success).toBe(
    true,
  );
  expect(
    rescheduleAcademyClassSessionInput.safeParse({
      ...input,
      endAt: input.startAt,
    }).success,
  ).toBe(false);
  expect(
    rescheduleAcademyClassSessionInput.safeParse({
      ...input,
      endAt: "2040-01-01T09:00:00Z",
    }).success,
  ).toBe(false);
});

test("discovery allows distinct filter IDs and rejects duplicate category or subject filters", () => {
  expect(
    listPublishedInput.parse({
      categoryIds: ["c1", "c2"],
      subjectIds: ["s1", "s2"],
    }),
  ).toMatchObject({ limit: 20, offset: 0 });
  expect(
    listPublishedInput.parse({ categoryIds: [], subjectIds: [] }),
  ).toMatchObject({ categoryIds: [], subjectIds: [] });
  expect(
    listPublishedInput.safeParse({ categoryIds: ["c1", "c1"] }).success,
  ).toBe(false);
  expect(
    listPublishedInput.safeParse({ subjectIds: ["s1", "s1"] }).success,
  ).toBe(false);
});

test("partial cancellation requires a bounded amount while full release and forfeit do not", () => {
  expect(
    cancelSeriesSessionInput.safeParse({
      sessionId: "s1",
      marksAction: "partial",
    }).success,
  ).toBe(false);
  expect(
    cancelSeriesSessionInput.parse({
      sessionId: "s1",
      marksAction: "partial",
      amount: 0,
    }).amount,
  ).toBe(0);
  expect(
    cancelSeriesSessionInput.parse({ sessionId: "s1", marksAction: "release" })
      .marksAction,
  ).toBe("release");
  expect(
    cancelSeriesSessionInput.parse({ sessionId: "s1", marksAction: "forfeit" })
      .marksAction,
  ).toBe("forfeit");
  expect(
    cancelSeriesSessionInput.safeParse({
      sessionId: "s1",
      marksAction: "partial",
      amount: -1,
    }).success,
  ).toBe(false);
});
