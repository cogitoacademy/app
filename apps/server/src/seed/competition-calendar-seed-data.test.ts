import { describe, expect, test } from "bun:test";
import { COMPETITION_CALENDAR_SEED } from "./competition-calendar-seed-data";

const COMPETITION_CATEGORY_IDS = new Set([
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "30000000-0000-4000-8000-000000000004",
  "30000000-0000-4000-8000-000000000005",
]);

describe("competition calendar seed data", () => {
  test("keeps the approved 63 events with unique stable identities", () => {
    expect(COMPETITION_CALENDAR_SEED).toHaveLength(63);
    const ids = new Set(COMPETITION_CALENDAR_SEED.map((event) => event.id));
    expect(ids.size).toBe(63);
    for (const event of COMPETITION_CALENDAR_SEED) {
      expect(event.sourceId).toBe(event.id);
    }
  });

  test("uses only seeded competition categories", () => {
    for (const event of COMPETITION_CALENDAR_SEED) {
      expect(event.categoryIds.length).toBeGreaterThan(0);
      for (const categoryId of event.categoryIds) {
        expect(COMPETITION_CATEGORY_IDS.has(categoryId)).toBe(true);
      }
    }
  });

  test("has valid dates, levels, and scales", () => {
    for (const event of COMPETITION_CALENDAR_SEED) {
      expect(Date.parse(event.endDate)).toBeGreaterThanOrEqual(
        Date.parse(event.startDate),
      );
      expect(event.educationLevels.length).toBeGreaterThan(0);
      for (const level of event.educationLevels) {
        expect(["sd", "smp", "sma", "mahasiswa"]).toContain(level);
      }
      expect([null, "international", "national"]).toContain(event.scale);
    }
  });
});
