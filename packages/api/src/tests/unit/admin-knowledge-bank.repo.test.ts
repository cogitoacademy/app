import { describe, expect, test } from "bun:test";

import {
  getById,
  remove,
  updateDetails,
} from "../../modules/admin-knowledge-bank/admin-knowledge-bank.repo";

describe("admin knowledge-bank repository", () => {
  test("returns null when a grant lookup finds no row", async () => {
    const conn = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    };

    await expect(getById(conn as any, "missing-grant")).resolves.toBeNull();
  });

  test("returns null when an update finds no grant", async () => {
    const conn = {
      update: () => ({
        set: () => ({
          where: () => ({ returning: async () => [] }),
        }),
      }),
    };

    await expect(
      updateDetails(conn as any, "missing-grant", {
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        note: null,
      }),
    ).resolves.toBeNull();
  });

  test("returns null when a delete finds no grant", async () => {
    const conn = {
      delete: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    };

    await expect(remove(conn as any, "missing-grant")).resolves.toBeNull();
  });
});
