import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { notification, user } from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function insertNotification(
  userId: string,
  overrides: Partial<typeof notification.$inferInsert> = {},
) {
  const [row] = await db
    .insert(notification)
    .values({
      userId,
      category: "booking",
      title: "Test notification",
      body: "Body text",
      severity: "info",
      eventKey: `test.${crypto.randomUUID()}`,
      ...overrides,
    })
    .returning();
  return row!;
}

describe("Notification list & read flow", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.notif.${ts}@cogito.test`;
  let studentClient: TestClient;
  let studentId: string;

  beforeAll(async () => {
    const res = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Notif",
    );
    studentClient = createTestClient(await createTestContext(res.cookie));
    const ctx = await createTestContext(res.cookie);
    studentId = ctx.session?.user?.id ?? "";
  });

  test("list returns notifications for current user", async () => {
    await insertNotification(studentId, {
      title: "Booking accepted",
      body: "Tutor accepted your booking",
      severity: "action",
    });
    await insertNotification(studentId, {
      title: "Session completed",
      body: "Tutor marked session complete",
      severity: "info",
    });

    const result = await studentClient.notification.list({});

    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items[0]!.userId).toBe(studentId);
  });

  test("list only returns own notifications", async () => {
    const otherId = crypto.randomUUID();
    await db.insert(user).values({
      id: otherId,
      email: `other.${ts}@cogito.test`,
      name: "Other",
    });
    await insertNotification(otherId, { title: "Other user notif" });
    await insertNotification(studentId, { title: "My notif" });

    const result = await studentClient.notification.list({});

    expect(
      result.items.every((n: { userId: string }) => n.userId === studentId),
    ).toBe(true);
    await db
      .delete(user)
      .where(eq(user.id, otherId))
      .catch(() => {});
  });

  test("list supports unreadOnly filter", async () => {
    const unread = await insertNotification(studentId, {
      title: "Unread one",
      isRead: false,
    });
    await insertNotification(studentId, {
      title: "Read one",
      isRead: true,
      readAt: new Date(),
    });

    const result = await studentClient.notification.list({ unreadOnly: true });

    expect(result.items.some((n: { id: string }) => n.id === unread.id)).toBe(
      true,
    );
    expect(
      result.items.every((n: { isRead: boolean }) => n.isRead === false),
    ).toBe(true);
  });

  test("getUnreadCount returns count of unread", async () => {
    await insertNotification(studentId, { isRead: false });
    await insertNotification(studentId, { isRead: false });

    const result = await studentClient.notification.getUnreadCount({});

    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(typeof result.count).toBe("number");
  });

  test("markAsRead sets isRead true and readAt", async () => {
    const n = await insertNotification(studentId, { isRead: false });

    await studentClient.notification.markAsRead({ id: n.id });

    const [updated] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, n.id))
      .limit(1);
    expect(updated!.isRead).toBe(true);
    expect(updated!.readAt).not.toBeNull();
  });

  test("updateReadStatus marks selected notifications read or unread", async () => {
    const first = await insertNotification(studentId, { isRead: false });
    const second = await insertNotification(studentId, {
      isRead: true,
      readAt: new Date(),
    });

    await studentClient.notification.updateReadStatus({
      ids: [first.id, second.id],
      isRead: false,
    });

    const updated = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, studentId));
    const selected = updated.filter((row) =>
      [first.id, second.id].includes(row.id),
    );

    expect(selected.every((row) => row.isRead === false)).toBe(true);
    expect(selected.every((row) => row.readAt === null)).toBe(true);

    await studentClient.notification.updateReadStatus({
      ids: [first.id, second.id],
      isRead: true,
    });

    const readRows = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, studentId));
    const selectedReadRows = readRows.filter((row) =>
      [first.id, second.id].includes(row.id),
    );

    expect(selectedReadRows.every((row) => row.isRead === true)).toBe(true);
    expect(selectedReadRows.every((row) => row.readAt !== null)).toBe(true);
  });

  test("updateReadStatus never changes another user's notification", async () => {
    const otherId = crypto.randomUUID();
    await db.insert(user).values({
      id: otherId,
      email: `other3.${ts}@cogito.test`,
      name: "Other 3",
    });
    const otherNotif = await insertNotification(otherId, { isRead: false });

    await studentClient.notification.updateReadStatus({
      ids: [otherNotif.id],
      isRead: true,
    });

    const [stillUnread] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, otherNotif.id))
      .limit(1);
    expect(stillUnread!.isRead).toBe(false);
    await db
      .delete(user)
      .where(eq(user.id, otherId))
      .catch(() => {});
  });

  test("markAsRead only affects own notifications", async () => {
    const otherId = crypto.randomUUID();
    await db.insert(user).values({
      id: otherId,
      email: `other2.${ts}@cogito.test`,
      name: "Other 2",
    });
    const otherNotif = await insertNotification(otherId, { isRead: false });

    await studentClient.notification
      .markAsRead({ id: otherNotif.id })
      .catch(() => {});

    const [stillUnread] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, otherNotif.id))
      .limit(1);
    expect(stillUnread!.isRead).toBe(false);
    await db
      .delete(user)
      .where(eq(user.id, otherId))
      .catch(() => {});
  });

  test("markAllAsRead marks all own unread notifications", async () => {
    await insertNotification(studentId, { isRead: false, title: "Batch 1" });
    await insertNotification(studentId, { isRead: false, title: "Batch 2" });
    await insertNotification(studentId, { isRead: false, title: "Batch 3" });

    await studentClient.notification.markAllAsRead({});

    const unread = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, studentId));
    const stillUnread = unread.filter((n) => n.isRead === false);
    expect(stillUnread.length).toBe(0);
  });
});
