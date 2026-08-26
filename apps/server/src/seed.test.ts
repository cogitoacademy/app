import { describe, expect, test } from "bun:test";
import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";
import { seedAllowed, seedAdminPassword } from "./seed";
import { PACKAGES, seedPackages } from "./seed-packages";

describe("seed guards", () => {
  test("seedAllowed is false in production without explicit flag", () => {
    expect(seedAllowed("production", undefined)).toBe(false);
    expect(seedAllowed("production", "true")).toBe(true);
    expect(seedAllowed("development", undefined)).toBe(true);
  });

  test("seedAllowed treats staging like production", () => {
    expect(seedAllowed("staging", undefined)).toBe(false);
    expect(seedAllowed("staging", "true")).toBe(true);
  });

  test("seedAdminPassword rejects short or missing passwords", () => {
    expect(seedAdminPassword(undefined)).toBeNull();
    expect(seedAdminPassword("short")).toBeNull();
    expect(seedAdminPassword("a-strong-12-char-pw")).toBe(
      "a-strong-12-char-pw",
    );
  });
});

describe("seed package prices (PRD OQ-01)", () => {
  const PRD_PACKAGES = [
    { code: "starter", marks: 50, priceIdr: 312500 },
    { code: "learner", marks: 120, priceIdr: 690000 },
    { code: "explorer", marks: 200, priceIdr: 1070000 },
    { code: "pioneer", marks: 400, priceIdr: 2000000 },
  ];

  test("PACKAGES table matches PRD OQ-01 values", () => {
    const byCode = new Map(PACKAGES.map((p) => [p.code, p]));
    for (const expected of PRD_PACKAGES) {
      expect(byCode.get(expected.code)).toMatchObject({
        marks: expected.marks,
        priceIdr: expected.priceIdr,
      });
    }
  });

  test("seeded markPackage rows match PRD OQ-01 values", async () => {
    await db.delete(markPackage);
    await seedPackages();
    const rows = await db.select().from(markPackage);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    for (const expected of PRD_PACKAGES) {
      expect(byCode.get(expected.code)).toMatchObject({
        marks: expected.marks,
        priceIdr: expected.priceIdr,
      });
    }
  });
});
