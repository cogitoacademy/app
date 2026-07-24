import { describe, it, expect } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  NotificationNotFoundError,
  mapNotificationError,
} from "../../modules/notification/notification.errors";

class TestDomainError extends DomainError {
  readonly domain = "test";
  constructor() {
    super("TEST_ERROR", "Test error");
  }
}

describe("notification.errors", () => {
  describe("NotificationNotFoundError", () => {
    it("should be instance of DomainError", () => {
      const err = new NotificationNotFoundError("n1");
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(Error);
    });
    it("should have correct properties", () => {
      const err = new NotificationNotFoundError("n1");
      expect(err.code).toBe("NOTIFICATION_NOT_FOUND");
      expect(err.domain).toBe("notification");
      expect(err.message).toBe("Notification not found");
      expect(err.details).toEqual({ notificationId: "n1" });
      expect(err.name).toBe("NotificationNotFoundError");
    });
  });
  describe("mapNotificationError", () => {
    it("should map NotificationNotFoundError to NOT_FOUND", () => {
      const result = mapNotificationError(new NotificationNotFoundError("n1"));
      expect(result.status).toBe(404);
    });
    it("should fall back to INTERNAL_SERVER_ERROR for unknown domain error", () => {
      const result = mapNotificationError(new TestDomainError());
      expect(result.status).toBe(500);
    });
  });
});
