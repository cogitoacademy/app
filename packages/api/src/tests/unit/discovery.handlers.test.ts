import { describe, test, expect, mock } from "bun:test";
import { discoveryHandlers } from "../../modules/tutor-discovery/discovery.handlers";

describe("discoveryHandlers", () => {
  describe("listPublished", () => {
    test("calls discovery.listPublished with input", async () => {
      const listPublished = mock(async () => [{ id: "t1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { discovery: { listPublished } },
      };
      const input = { search: "math", limit: 20, offset: 0 };

      const result = await discoveryHandlers.listPublished({ context, input });

      expect(listPublished).toHaveBeenCalledWith(input);
      expect(result).toEqual([{ id: "t1" }]);
    });

    test("calls discovery.listPublished with empty object when input is undefined", async () => {
      const listPublished = mock(async () => []);
      const context = {
        session: { user: { id: "u1" } },
        services: { discovery: { listPublished } },
      };

      await discoveryHandlers.listPublished({
        context,
        input: undefined as any,
      });

      expect(listPublished).toHaveBeenCalledWith({});
    });
  });

  describe("getProfile", () => {
    test("calls discovery.getProfile with input.tutorId", async () => {
      const getProfile = mock(async () => ({ id: "t1", displayName: "Tutor" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { discovery: { getProfile } },
      };
      const input = { tutorId: "t1" };

      const result = await discoveryHandlers.getProfile({ context, input });

      expect(getProfile).toHaveBeenCalledWith("t1");
      expect(result).toEqual({ id: "t1", displayName: "Tutor" });
    });
  });
});
