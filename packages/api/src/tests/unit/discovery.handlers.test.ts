import { describe, test, expect, mock } from "bun:test";
import { createDiscoveryHandler } from "../../modules/tutor-discovery/discovery.handler";
import type { DiscoveryService } from "../../modules/tutor-discovery/discovery.service";
import type { ProfileProjection } from "../../modules/tutor-discovery/discovery.service";
import { TutorProfileNotFoundError } from "../../modules/tutor-discovery/discovery.errors";

function makeService(
  overrides: Partial<DiscoveryService> = {},
): DiscoveryService {
  return {
    listPublished: mock(
      async () => [{ id: "t1", displayName: "Tutor" }] as ProfileProjection[],
    ),
    getProfile: mock(
      async () => ({ id: "t1", displayName: "Tutor" }) as ProfileProjection,
    ),
    ...overrides,
  } as DiscoveryService;
}

describe("discoveryHandlers", () => {
  describe("listPublished", () => {
    test("calls service.listPublished with input", async () => {
      const listPublished = mock(async () => [
        { id: "t1", displayName: "Tutor" },
      ]);
      const service = makeService({ listPublished });
      const handler = createDiscoveryHandler({ service });
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { search: "math", limit: 20, offset: 0 };

      await handler.listPublished({ context, input });

      expect(listPublished).toHaveBeenCalledWith(input);
    });

    test("calls service.listPublished with empty object when input is undefined", async () => {
      const listPublished = mock(async () => []);
      const service = makeService({ listPublished });
      const handler = createDiscoveryHandler({ service });
      const context = { session: { user: { id: "u1" } } } as any;

      await handler.listPublished({
        context,
        input: undefined as any,
      });

      expect(listPublished).toHaveBeenCalledWith({});
    });
  });

  describe("getProfile", () => {
    test("calls service.getProfile with input.tutorId", async () => {
      const getProfile = mock(async () => ({ id: "t1", displayName: "Tutor" }));
      const service = makeService({ getProfile });
      const handler = createDiscoveryHandler({ service });
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { tutorId: "t1" };

      const result = await handler.getProfile({ context, input });

      expect(getProfile).toHaveBeenCalledWith("t1");
      expect(result.id).toBe("t1");
    });

    test("maps TutorProfileNotFoundError to NOT_FOUND", async () => {
      const getProfile = mock(async () => {
        throw new TutorProfileNotFoundError("t1");
      });
      const service = makeService({ getProfile });
      const handler = createDiscoveryHandler({ service });
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { tutorId: "t1" };

      try {
        await handler.getProfile({ context, input });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.code).toBe("NOT_FOUND");
      }
    });
  });
});
