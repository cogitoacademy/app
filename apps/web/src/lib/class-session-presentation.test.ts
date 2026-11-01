import { expect, test } from "bun:test";
import {
  getClassSessionScheduleStatus,
  sortClassSessions,
} from "./class-session-presentation";

const now = new Date("2026-11-01T04:00:00.000Z").getTime();

test("schedule order keeps live and upcoming sessions above finished ones", () => {
  const ordered = sortClassSessions(
    [
      {
        id: "s3",
        state: "completed",
        startAt: "2026-10-31T03:00:00.000Z",
        endAt: "2026-10-31T05:00:00.000Z",
        sequenceNumber: 3,
      },
      {
        id: "s1",
        state: "completed",
        startAt: "2026-11-01T06:00:00.000Z",
        endAt: "2026-11-01T07:00:00.000Z",
        sequenceNumber: 1,
      },
      {
        id: "s4",
        state: "scheduled",
        startAt: "2026-11-05T03:00:00.000Z",
        endAt: "2026-11-05T05:00:00.000Z",
        sequenceNumber: 4,
      },
      {
        id: "s2",
        state: "scheduled",
        startAt: "2026-11-03T03:00:00.000Z",
        endAt: "2026-11-03T05:00:00.000Z",
        sequenceNumber: 2,
      },
      {
        id: "live",
        state: "scheduled",
        startAt: "2026-11-01T03:00:00.000Z",
        endAt: "2026-11-01T05:00:00.000Z",
        sequenceNumber: 5,
      },
      {
        id: "cancelled",
        state: "cancelled",
        startAt: "2026-11-01T01:00:00.000Z",
        endAt: "2026-11-01T02:00:00.000Z",
        sequenceNumber: 6,
      },
    ],
    now,
  );

  expect(ordered.map((session) => session.id)).toEqual([
    "live",
    "s2",
    "s4",
    "s1",
    "s3",
    "cancelled",
  ]);
});

test("schedule status marks future, live, finished, and cancelled sessions", () => {
  expect(
    getClassSessionScheduleStatus(
      {
        state: "scheduled",
        startAt: "2026-11-01T05:00:00.000Z",
        endAt: "2026-11-01T07:00:00.000Z",
      },
      now,
    ),
  ).toEqual({ label: "Upcoming", variant: "info" });
  expect(
    getClassSessionScheduleStatus(
      {
        state: "scheduled",
        startAt: "2026-11-01T03:00:00.000Z",
        endAt: "2026-11-01T05:00:00.000Z",
      },
      now,
    ),
  ).toEqual({ label: "In progress", variant: "primary" });
  expect(
    getClassSessionScheduleStatus(
      {
        state: "scheduled",
        startAt: "2026-11-01T01:00:00.000Z",
        endAt: "2026-11-01T02:00:00.000Z",
      },
      now,
    ),
  ).toEqual({ label: "Completed", variant: "secondary" });
  expect(
    getClassSessionScheduleStatus(
      {
        state: "completed",
        startAt: "2026-11-01T05:00:00.000Z",
        endAt: "2026-11-01T07:00:00.000Z",
      },
      now,
    ),
  ).toEqual({ label: "Completed", variant: "secondary" });
  expect(
    getClassSessionScheduleStatus(
      {
        state: "cancelled",
        startAt: "2026-11-01T05:00:00.000Z",
        endAt: "2026-11-01T07:00:00.000Z",
      },
      now,
    ),
  ).toEqual({ label: "Cancelled", variant: "danger" });
});
