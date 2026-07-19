import { describe, test, expect, mock } from "bun:test";
import { adminHandlers } from "../../modules/admin/admin.handlers";

describe("adminHandlers", () => {
  describe("listUsers", () => {
    test("calls admin.listUsers with input", async () => {
      const listUsers = mock(async () => ({ items: [], nextCursor: null }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { admin: { listUsers } },
      };
      const input = { limit: 10, offset: 0 };

      const result = await adminHandlers.listUsers({ context, input });

      expect(listUsers).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    test("calls admin.listUsers with empty object when input is undefined", async () => {
      const listUsers = mock(async () => ({ items: [], nextCursor: null }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { admin: { listUsers } },
      };

      await adminHandlers.listUsers({ context, input: undefined as any });

      expect(listUsers).toHaveBeenCalledWith({});
    });
  });

  describe("setRole", () => {
    test("calls admin.setRole with session user id and input", async () => {
      const setRole = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { admin: { setRole } },
      };
      const input = { userId: "u1", role: "tutor" };

      const result = await adminHandlers.setRole({ context, input });

      expect(setRole).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ ok: true });
    });
  });
});
