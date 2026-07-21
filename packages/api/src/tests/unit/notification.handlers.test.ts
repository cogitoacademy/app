import { describe, test, expect, mock } from "bun:test";
import { notificationHandlers } from "../../modules/notification/notification.handlers";

describe("notificationHandlers", () => {
  describe("list", () => {
    test("calls notification.list with userId and input", async () => {
      const list = mock(async () => [{ id: "n1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { list } },
      };
      const input = { unreadOnly: true, limit: 10 };

      const result = await notificationHandlers.list({ context, input });

      expect(list).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual([{ id: "n1" }]);
    });

    test("calls notification.list with empty object when input is undefined", async () => {
      const list = mock(async () => []);
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { list } },
      };

      await notificationHandlers.list({ context, input: undefined as any });

      expect(list).toHaveBeenCalledWith("u1", {});
    });
  });

  describe("getUnreadCount", () => {
    test("calls notification.getUnreadCount and returns { count }", async () => {
      const getUnreadCount = mock(async () => 5);
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { getUnreadCount } },
      };

      const result = await notificationHandlers.getUnreadCount({ context });

      expect(getUnreadCount).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ count: 5 });
    });

    test("returns { count: 0 } when no unread notifications", async () => {
      const getUnreadCount = mock(async () => 0);
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { getUnreadCount } },
      };

      const result = await notificationHandlers.getUnreadCount({ context });

      expect(result).toEqual({ count: 0 });
    });
  });

  describe("markAsRead", () => {
    test("calls notification.markAsRead with userId and input.id, returns { ok: true }", async () => {
      const markAsRead = mock(async () => {});
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { markAsRead } },
      };
      const input = { id: "n1" };

      const result = await notificationHandlers.markAsRead({ context, input });

      expect(markAsRead).toHaveBeenCalledWith("u1", "n1");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("markAllAsRead", () => {
    test("calls notification.markAllAsRead with userId, returns { ok: true }", async () => {
      const markAllAsRead = mock(async () => {});
      const context = {
        session: { user: { id: "u1" } },
        services: { notification: { markAllAsRead } },
      };

      const result = await notificationHandlers.markAllAsRead({ context });

      expect(markAllAsRead).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ ok: true });
    });
  });
});
