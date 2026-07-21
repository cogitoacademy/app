import { describe, test, expect, mock } from "bun:test";
import { createDiscoveryHandler } from "../../modules/tutor-discovery/discovery.handler";

function makeDiscoveryRepo(overrides: Record<string, unknown> = {}) {
  return {
    listPublished: mock(async () => [{ id: "t1" }]),
    getProfileById: mock(async () => ({ id: "t1", displayName: "Tutor" })),
    ...overrides,
  };
}

function makeDb() {
  return {} as any;
}

describe("discoveryHandlers", () => {
  describe("listPublished", () => {
    test("calls discoveryRepo.listPublished with input", async () => {
      const discoveryRepo = makeDiscoveryRepo({
        listPublished: mock(async () => [{ id: "t1", displayName: "Tutor" }]),
      });
      const db = makeDb();
      const handler = createDiscoveryHandler({
        discoveryRepo: discoveryRepo as any,
        db,
      });
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { search: "math", limit: 20, offset: 0 };

      await handler.listPublished({ context, input });

      expect(discoveryRepo.listPublished).toHaveBeenCalledWith(db, input);
    });

    test("calls discoveryRepo.listPublished with empty object when input is undefined", async () => {
      const discoveryRepo = makeDiscoveryRepo({
        listPublished: mock(async () => []),
      });
      const db = makeDb();
      const handler = createDiscoveryHandler({
        discoveryRepo: discoveryRepo as any,
        db,
      });
      const context = { session: { user: { id: "u1" } } } as any;

      await handler.listPublished({
        context,
        input: undefined as any,
      });

      expect(discoveryRepo.listPublished).toHaveBeenCalledWith(db, {});
    });
  });

  describe("getProfile", () => {
    test("calls discoveryRepo.getProfileById with input.tutorId", async () => {
      const discoveryRepo = makeDiscoveryRepo({
        getProfileById: mock(async () => ({ id: "t1", displayName: "Tutor" })),
      });
      const db = makeDb();
      const handler = createDiscoveryHandler({
        discoveryRepo: discoveryRepo as any,
        db,
      });
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { tutorId: "t1" };

      const result = await handler.getProfile({ context, input });

      expect(discoveryRepo.getProfileById).toHaveBeenCalledWith(db, "t1");
      expect(result.id).toBe("t1");
    });
  });
});
