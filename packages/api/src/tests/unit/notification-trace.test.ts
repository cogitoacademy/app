import { describe, test, expect, mock } from "bun:test";
import { runWithTrace } from "../../lib/trace";
import { createNotificationService } from "../../modules/notification/notification.service";
import type { NotificationRepo } from "../../modules/notification/notification.repo";

function makeRepo(): NotificationRepo {
  return {
    findNotificationByEventKey: mock(async () => null),
    insertNotification: mock(async () => ({ id: "n1" })),
    findUserEmail: mock(async () => ""),
    insertDispatch: mock(async () => {}),
  } as unknown as NotificationRepo;
}

describe("notification trace persistence (T1)", () => {
  test("write persists the active traceId on metadata", async () => {
    const repo = makeRepo();
    const service = createNotificationService(repo);

    await runWithTrace({ traceId: "req_notif", userId: "u1" }, () =>
      service.write({
        db: {} as any,
        userId: "u1",
        category: "booking",
        title: "T",
        body: "B",
        eventKey: "evt.trace.1",
      }),
    );

    expect(repo.insertNotification).toHaveBeenCalledTimes(1);
    const values = (repo.insertNotification as any).mock.calls[0][1];
    expect(values.metadata).toMatchObject({ traceId: "req_notif" });
  });

  test("write keeps an explicit caller traceId", async () => {
    const repo = makeRepo();
    const service = createNotificationService(repo);

    await runWithTrace({ traceId: "req_active" }, () =>
      service.write({
        db: {} as any,
        userId: "u1",
        category: "booking",
        title: "T",
        body: "B",
        eventKey: "evt.trace.2",
        metadata: { traceId: "req_caller" },
      }),
    );

    const values = (repo.insertNotification as any).mock.calls[0][1];
    expect(values.metadata).toMatchObject({ traceId: "req_caller" });
  });

  test("write stores empty metadata with no active trace", async () => {
    const repo = makeRepo();
    const service = createNotificationService(repo);

    await service.write({
      db: {} as any,
      userId: "u1",
      category: "booking",
      title: "T",
      body: "B",
      eventKey: "evt.trace.3",
    });

    const values = (repo.insertNotification as any).mock.calls[0][1];
    expect(values.metadata).toEqual({});
  });
});
