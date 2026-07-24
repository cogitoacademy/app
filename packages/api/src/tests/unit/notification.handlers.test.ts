import { describe, test, expect, mock } from "bun:test";
import { createNotificationHandler } from "../../modules/notification/notification.handler";

describe("notificationHandler", () => {
  const list = mock(async () => [{ id: "n1" }]);
  const getUnreadCount = mock(async () => 5);
  const markAsRead = mock(async () => {});
  const markAllAsRead = mock(async () => {});
  const handler = createNotificationHandler({
    notificationService: {
      list,
      getUnreadCount,
      markAsRead,
      markAllAsRead,
    } as any,
  });

  describe("list", () => {
    test("calls notificationService.list with userId and input", async () => {
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { unreadOnly: true, limit: 10 };

      const result = await handler.list({ context, input });

      expect(list).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual([{ id: "n1" }]);
    });

    test("calls notificationService.list with empty object when input is undefined", async () => {
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      await handler.list({ context, input: undefined as any });

      expect(list).toHaveBeenCalledWith("u1", {});
    });
  });

  describe("getUnreadCount", () => {
    test("calls notificationService.getUnreadCount and returns { count }", async () => {
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      const result = await handler.getUnreadCount({ context });

      expect(getUnreadCount).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ count: 5 });
    });

    test("returns { count: 0 } when no unread notifications", async () => {
      getUnreadCount.mockImplementationOnce(async () => 0);
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      const result = await handler.getUnreadCount({ context });

      expect(result).toEqual({ count: 0 });
    });
  });

  describe("markAsRead", () => {
    test("calls notificationService.markAsRead with userId and input.id", async () => {
      const context = {
        session: { user: { id: "u1" } },
      } as any;
      const input = { id: "n1" };

      await handler.markAsRead({ context, input });

      expect(markAsRead).toHaveBeenCalledWith("u1", "n1");
    });
  });

  describe("markAllAsRead", () => {
    test("calls notificationService.markAllAsRead with userId", async () => {
      const context = {
        session: { user: { id: "u1" } },
      } as any;

      await handler.markAllAsRead({ context });

      expect(markAllAsRead).toHaveBeenCalledWith("u1");
    });
  });
});
