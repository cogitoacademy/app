import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { db } from "@cogito-app/db";
import {
  calendarEvent,
  calendarEventCategory,
  subjectCategory,
} from "@cogito-app/db/schema";
import {
  assertSafeTestDatabase,
  createTestClient,
  createTestContext,
} from "../helpers/test-client";

const safeDatabase = (() => {
  try {
    assertSafeTestDatabase();
    return true;
  } catch {
    return false;
  }
})();

const guardedTest = safeDatabase ? test : test.skip;
const fixture = crypto.randomUUID();
const categoryId = crypto.randomUUID();
const firstEventId = crypto.randomUUID();
const secondEventId = crypto.randomUUID();
const inactiveEventId = crypto.randomUUID();
const eventIds = [firstEventId, secondEventId, inactiveEventId];
const palette = {
  lightTextColor: "oklch(0.2 0.02 250)",
  lightBackgroundColor: "oklch(0.96 0.03 250)",
  darkTextColor: "oklch(0.92 0.02 250)",
  darkBackgroundColor: "oklch(0.25 0.04 250)",
};

describe("publicContent.calendar.list", () => {
  beforeAll(async () => {
    if (!safeDatabase) return;
    await db.insert(subjectCategory).values({
      id: categoryId,
      parentId: null,
      slug: `public-calendar-${fixture}`,
      name: "Debate",
      isActive: true,
      sortOrder: 1,
      ...palette,
    });
    await db.insert(calendarEvent).values([
      {
        id: firstEventId,
        sourceId: `public-calendar-${fixture}-first`,
        title: "English Debate",
        description: "English description",
        location: "Jakarta",
        startDate: new Date("2026-12-01T00:00:00.000Z"),
        endDate: new Date("2026-12-02T00:00:00.000Z"),
        educationLevels: ["sma"],
        scale: "national",
        organizer: "Organizer",
        registrationDeadline: new Date("2026-11-25T00:00:00.000Z"),
        registrationLink: "https://example.test/register",
        socialMediaLink: "https://example.test/social",
        isActive: true,
      },
      {
        id: secondEventId,
        sourceId: `public-calendar-${fixture}-second`,
        title: "English Only",
        description: null,
        location: null,
        startDate: new Date("2026-12-02T00:00:00.000Z"),
        endDate: new Date("2026-12-02T00:00:00.000Z"),
        educationLevels: [],
        scale: null,
        organizer: null,
        registrationDeadline: null,
        registrationLink: null,
        socialMediaLink: null,
        isActive: true,
      },
      {
        id: inactiveEventId,
        sourceId: `public-calendar-${fixture}-inactive`,
        title: "Inactive Event",
        description: null,
        location: null,
        startDate: new Date("2026-11-30T00:00:00.000Z"),
        endDate: new Date("2026-11-30T00:00:00.000Z"),
        educationLevels: [],
        scale: null,
        organizer: null,
        registrationDeadline: null,
        registrationLink: null,
        socialMediaLink: null,
        isActive: false,
      },
    ]);
    await db.insert(calendarEventCategory).values([
      { eventId: firstEventId, categoryId },
      { eventId: inactiveEventId, categoryId },
    ]);
  });

  afterAll(async () => {
    if (!safeDatabase) return;
    await db.delete(calendarEvent).where(inArray(calendarEvent.id, eventIds));
    await db.delete(subjectCategory).where(eq(subjectCategory.id, categoryId));
  });

  guardedTest(
    "is anonymous, active-only, ordered by start date, and returns app calendar data",
    async () => {
      const client = createTestClient(await createTestContext());
      const rows = await client.publicContent.calendar.list({ locale: "id" });
      const fixtureRows = rows.filter((row) => eventIds.includes(row.id));

      expect(fixtureRows.map((row) => row.id)).toEqual([
        firstEventId,
        secondEventId,
      ]);
      expect(rows.map((row) => row.startDate)).toEqual(
        rows.map((row) => row.startDate).toSorted(),
      );
      expect(rows.some((row) => row.id === inactiveEventId)).toBe(false);

      const event = fixtureRows[0]!;
      expect(event).toMatchObject({
        title: "English Debate",
        description: "English description",
        location: "Jakarta",
      });
      expect(event.categories).toEqual([
        {
          id: categoryId,
          slug: `public-calendar-${fixture}`,
          name: "Debate",
          parentColors: palette,
        },
      ]);
      expect(Object.keys(event)).toEqual([
        "id",
        "title",
        "description",
        "location",
        "startDate",
        "endDate",
        "categories",
        "educationLevels",
        "scale",
        "organizer",
        "registrationDeadline",
        "registrationLink",
        "socialMediaLink",
      ]);
      expect(event).not.toHaveProperty("sourceId");
      expect(event).not.toHaveProperty("sourceHash");
      expect(event).not.toHaveProperty("version");
      expect(event).not.toHaveProperty("isActive");

      expect(fixtureRows[1]).toMatchObject({
        title: "English Only",
        description: null,
        location: null,
        categories: [],
      });
    },
  );
});
