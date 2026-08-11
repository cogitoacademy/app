# Consolidation Phase 2.5: Gaps & Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between the implemented Phase 1/2 consolidation work and the current codebase: extract the two remaining repo-less modules, fix 6 layer violations, add the missing notification error file, fix a type escape hatch, and push test coverage to best-effort 100%.

**Architecture:** 4-layer (Router → Handler → Service → Repository). Services throw only `DomainError` subclasses. Repos are pure data primitives (no business logic, no HTTP errors). Handlers map domain errors via `withDomainMap`. Consumer-driven ports (narrow inline interfaces) for cross-module deps. Race-safe atomic upserts stay as repo primitives; orchestration moves to services.

**Tech Stack:** Bun, TypeScript, oRPC, Drizzle ORM, Zod, `bun:test` with `mock()`.

**Spec:** `docs/plans/CONSOLIDATION-PHASE2.5-GAPS.md`

**Test conventions:** Unit tests in `packages/api/src/tests/unit/`. Use `import { describe, test, expect, mock } from "bun:test"`. Mock repos/ports with `mock(async () => ...)`. Tests import directly from module files (no DI container in tests — construct service with mocked deps).

**Verification commands:**

- Lint: `bun run check`
- Types: `bun run check-types`
- Build: `bun run build`
- Test: `bun test`
- Coverage: `bun run test:coverage`
- Full CI gate: `bun run check && bun run check-types && bun run build && bun test`

---

## Task 1: Extract notification.repo.ts

**Files:**

- Create: `packages/api/src/modules/notification/notification.repo.ts`
- Modify: `packages/api/src/modules/notification/notification.service.ts`
- Modify: `packages/api/src/modules/notification/index.ts`
- Create: `packages/api/src/tests/unit/notification.repo.test.ts`
- Modify: `packages/api/src/tests/unit/notification.service.test.ts`

- [ ] **Step 1: Write the failing test for notification.repo.ts**

Create `packages/api/src/tests/unit/notification.repo.test.ts`:

```ts
import { describe, test, expect, mock } from "bun:test";
import { createNotificationRepo } from "../../modules/notification/notification.repo";

function makeConn(overrides: Record<string, unknown> = {}) {
  const toArray = <T>(rows: T[]) => ({
    from: mock(() => ({
      where: mock(() => ({
        orderBy: mock(() => ({ limit: mock(() => rows) })),
        limit: mock(() => rows),
      })),
      orderBy: mock(() => ({ limit: mock(() => rows) })),
      limit: mock(() => rows),
    })),
    insert: mock(() => ({
      values: mock(() => ({ returning: mock(async () => rows) })),
    })),
    update: mock(() => ({
      set: mock(() => ({ where: mock(async () => rows) })),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({ limit: mock(async () => rows) })),
      })),
    })),
  });
  return toArray(overrides.rows ?? []) as any;
}

describe("NotificationRepo", () => {
  test("findNotificationByEventKey returns first match or null", async () => {
    const conn = makeConn({ rows: [{ id: "n1" }] });
    const repo = createNotificationRepo({} as any);
    const result = await repo.findNotificationByEventKey(conn, "evt1");
    expect(result).toEqual({ id: "n1" });
  });

  test("insertNotification returns the inserted row", async () => {
    const conn = makeConn({ rows: [{ id: "n1", title: "Test" }] });
    const repo = createNotificationRepo({} as any);
    const result = await repo.insertNotification(conn, {
      userId: "u1",
      category: "booking",
      title: "Test",
      body: "Body",
      severity: "info",
      eventKey: "evt1",
      metadata: {},
    });
    expect(result).toEqual({ id: "n1", title: "Test" });
  });

  test("findUserEmail returns email string", async () => {
    const conn = makeConn({ rows: [{ email: "user@test.com" }] });
    const repo = createNotificationRepo({} as any);
    const result = await repo.findUserEmail(conn, "u1");
    expect(result).toBe("user@test.com");
  });

  test("insertDispatch returns void", async () => {
    const conn = makeConn({ rows: [] });
    const repo = createNotificationRepo({} as any);
    const result = await repo.insertDispatch(conn, {
      notificationId: "n1",
      channel: "email",
      recipientEmail: "user@test.com",
      status: "queued",
    });
    expect(result).toBeUndefined();
  });

  test("updateDispatchStatus returns void", async () => {
    const conn = makeConn({ rows: [] });
    const repo = createNotificationRepo({} as any);
    const result = await repo.updateDispatchStatus(conn, "n1", "sent");
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/notification.repo.test.ts`
Expected: FAIL — `createNotificationRepo` not found or methods missing.

- [ ] **Step 3: Create notification.repo.ts**

Create `packages/api/src/modules/notification/notification.repo.ts`:

```ts
import { eq, and, desc, lt, count } from "drizzle-orm";
import {
  notification,
  notificationDispatch,
  user,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { DbType } from "../../lib/db";

export type NotificationRepo = ReturnType<typeof createNotificationRepo>;

export async function findNotificationByEventKey(
  conn: DbOrTx,
  eventKey: string,
) {
  const [existing] = await conn
    .select({ id: notification.id })
    .from(notification)
    .where(eq(notification.eventKey, eventKey))
    .limit(1);
  return existing ?? null;
}

export async function insertNotification(
  conn: DbOrTx,
  values: {
    userId: string;
    bookingId?: string | null;
    category: string;
    title: string;
    body: string;
    severity: string;
    eventKey: string;
    metadata: Record<string, unknown>;
  },
) {
  const [inserted] = await conn
    .insert(notification)
    .values({
      userId: values.userId,
      bookingId: values.bookingId ?? null,
      category: values.category,
      title: values.title,
      body: values.body,
      severity: values.severity,
      eventKey: values.eventKey,
      metadata: values.metadata,
    })
    .returning();
  return inserted;
}

export async function findUserEmail(conn: DbOrTx, userId: string) {
  const [userRow] = await conn
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return userRow?.email ?? "";
}

export async function insertDispatch(
  conn: DbOrTx,
  values: {
    notificationId: string;
    channel: string;
    recipientEmail: string;
    status: string;
  },
) {
  await conn.insert(notificationDispatch).values(values);
}

export async function updateDispatchStatus(
  conn: DbOrTx,
  notificationId: string,
  status: string,
) {
  await conn
    .update(notificationDispatch)
    .set({ status })
    .where(eq(notificationDispatch.notificationId, notificationId));
}

export async function listNotifications(
  conn: DbOrTx,
  userId: string,
  opts: {
    unreadOnly?: boolean;
    cursor?: string;
    limit: number;
  },
) {
  const conditions = [eq(notification.userId, userId)];
  if (opts.unreadOnly) {
    conditions.push(eq(notification.isRead, false));
  }
  if (opts.cursor) {
    conditions.push(lt(notification.createdAt, new Date(opts.cursor)));
  }
  return conn
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(opts.limit + 1);
}

export async function countUnread(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ value: count() })
    .from(notification)
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
  return Number(row?.value ?? 0);
}

export async function updateReadStatus(
  conn: DbOrTx,
  id: string,
  userId: string,
  read: boolean,
) {
  await conn
    .update(notification)
    .set({ isRead: read, readAt: read ? new Date() : null })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)));
}

export async function markAllRead(conn: DbOrTx, userId: string) {
  await conn
    .update(notification)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
}

export async function findDispatch(conn: DbOrTx, notificationId: string) {
  const [row] = await conn
    .select()
    .from(notificationDispatch)
    .where(eq(notificationDispatch.notificationId, notificationId))
    .limit(1);
  return row ?? null;
}

export function createNotificationRepo(db: DbType) {
  return {
    findNotificationByEventKey,
    insertNotification,
    findUserEmail,
    insertDispatch,
    updateDispatchStatus,
    listNotifications,
    countUnread,
    updateReadStatus,
    markAllRead,
    findDispatch,
  };
}
```

- [ ] **Step 4: Run repo test to verify it passes**

Run: `bun test packages/api/src/tests/unit/notification.repo.test.ts`
Expected: PASS

- [ ] **Step 5: Update notification.service.ts to use repo**

Modify `packages/api/src/modules/notification/notification.service.ts`. Replace the inline DB calls with repo calls. The service receives `repo` instead of (or in addition to) `db`. Replace the factory signature:

Change the import block and factory:

```ts
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  NOTIFICATION_SEVERITY,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../shared/constants";
import { log } from "../../lib/logger";
import type { NotificationRepo } from "./notification.repo";
```

Remove the `import { eq, and, desc, lt, count } from "drizzle-orm";` and `import { notification, notificationDispatch, user } from "@cogito-app/db/schema";` lines.

Change `createNotificationService` to accept `repo`:

```ts
export function createNotificationService(
  db: DbType,
  repo: NotificationRepo,
  emailPort?: NotificationEmailPort,
): InAppNotificationPort & {
  dispatchStatus: (notificationId: string) => Promise<unknown>;
} {
```

Update `writeInternal` to use `repo.findNotificationByEventKey`, `repo.insertNotification`, `repo.findUserEmail`, `repo.insertDispatch`, `repo.updateDispatchStatus` (all with `params.db` as the conn arg).

Update `list` to use `repo.listNotifications(db, userId, { unreadOnly, cursor, limit })` and compute `nextCursor` in the service from the returned rows (the repo returns `limit + 1` rows).

Update `getUnreadCount` to use `repo.countUnread(db, userId)`.

Update `markAsRead` to use `repo.updateReadStatus(db, id, userId, true)`.

Update `markAllAsRead` to use `repo.markAllRead(db, userId)`.

Update `dispatchStatus` to use `repo.findDispatch(db, notificationId)`.

- [ ] **Step 6: Update notification/index.ts to wire repo**

Modify `packages/api/src/modules/notification/index.ts`:

```ts
import type { DbType } from "../../lib/db";
import { createNotificationRepo } from "./notification.repo";
import { createNotificationService } from "./notification.service";
import { createNotificationHandler } from "./notification.handler";
import type { NotificationService } from "./notification.service";
import type { NotificationHandler } from "./notification.handler";

export type NotificationModule = ReturnType<typeof createNotificationModule>;

interface NotificationEmailPort {
  send(message: {
    to: string;
    subject: string;
    html: string;
    category: "booking" | "payment" | "refund" | "schedule" | "override";
  }): Promise<{ messageId: string } | { skipped: true }>;
}

export function createNotificationModule(deps: {
  db: DbType;
  email: NotificationEmailPort;
}) {
  const repo = createNotificationRepo(deps.db);
  const service = createNotificationService(deps.db, repo, deps.email);
  const handler = createNotificationHandler({ notificationService: service });
  return { service, handler };
}

export type { NotificationService, NotificationHandler };
```

- [ ] **Step 7: Update notification.service.test.ts mocks**

Modify `packages/api/src/tests/unit/notification.service.test.ts` to mock the repo instead of `db`. The test helpers should construct `createNotificationService(db, mockRepo, mockEmailPort)`.

- [ ] **Step 8: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass. No inline Drizzle imports in `notification.service.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/modules/notification/ packages/api/src/tests/unit/notification.repo.test.ts packages/api/src/tests/unit/notification.service.test.ts
git commit -m "refactor(api): extract notification repo layer from service"
```

---

## Task 2: Extract room.repo.ts

**Files:**

- Create: `packages/api/src/modules/room/room.repo.ts`
- Modify: `packages/api/src/modules/room/room.service.ts`
- Modify: `packages/api/src/modules/room/index.ts`
- Create: `packages/api/src/tests/unit/room.repo.test.ts`
- Modify: `packages/api/src/tests/unit/room.service.test.ts`

- [ ] **Step 1: Write the failing test for room.repo.ts**

Create `packages/api/src/tests/unit/room.repo.test.ts`:

```ts
import { describe, test, expect, mock } from "bun:test";
import { createRoomRepo } from "../../modules/room/room.repo";

function makeConn(rows: unknown[] = []) {
  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(async () => rows),
        limit: mock(async () => rows.slice(0, 1)),
      })),
    })),
    insert: mock(() => ({
      values: mock(() => ({ returning: mock(async () => rows) })),
    })),
    query: {
      room: {
        findFirst: mock(async () => rows[0] ?? null),
      },
    },
  } as any;
}

describe("RoomRepo", () => {
  test("findActiveRooms returns active rooms", async () => {
    const conn = makeConn([{ id: "r1", name: "Room A" }]);
    const repo = createRoomRepo({} as any);
    const result = await repo.findActiveRooms(conn);
    expect(result).toEqual([{ id: "r1", name: "Room A" }]);
  });

  test("insertRoom returns the created row", async () => {
    const conn = makeConn([{ id: "r1", name: "New Room" }]);
    const repo = createRoomRepo({} as any);
    const result = await repo.insertRoom(conn, {
      name: "New Room",
      location: "Building A",
      capacity: 10,
    });
    expect(result).toEqual({ id: "r1", name: "New Room" });
  });

  test("findRoomById returns room or null", async () => {
    const conn = makeConn([{ id: "r1", isActive: true }]);
    const repo = createRoomRepo({} as any);
    const result = await repo.findRoomById(conn, "r1");
    expect(result).toEqual({ id: "r1", isActive: true });
  });

  test("findRoomBookings returns bookings matching time range", async () => {
    const conn = makeConn([{ id: "rb1" }]);
    const repo = createRoomRepo({} as any);
    const result = await repo.findRoomBookings(
      conn,
      "r1",
      new Date(),
      new Date(),
    );
    expect(result).toEqual([{ id: "rb1" }]);
  });

  test("insertRoomBooking returns the created row", async () => {
    const conn = makeConn([{ id: "rb1", roomId: "r1" }]);
    const repo = createRoomRepo({} as any);
    const result = await repo.insertRoomBooking(conn, {
      roomId: "r1",
      bookingId: "b1",
      startAt: new Date(),
      endAt: new Date(),
      status: "CONFIRMED",
    });
    expect(result).toEqual({ id: "rb1", roomId: "r1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/room.repo.test.ts`
Expected: FAIL — `createRoomRepo` not found.

- [ ] **Step 3: Create room.repo.ts**

Create `packages/api/src/modules/room/room.repo.ts`:

```ts
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { room, roomBooking } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { DbType } from "../../lib/db";
import { ROOM_BOOKING_STATUS } from "../../shared/constants";

export type RoomRepo = ReturnType<typeof createRoomRepo>;

export async function findActiveRooms(conn: DbOrTx) {
  return conn.select().from(room).where(eq(room.isActive, true));
}

export async function insertRoom(
  conn: DbOrTx,
  values: { name: string; location: string; capacity: number },
) {
  const [row] = await conn.insert(room).values(values).returning();
  return row!;
}

export async function findRoomById(conn: DbOrTx, roomId: string) {
  return conn.query.room.findFirst({
    where: and(eq(room.id, roomId), eq(room.isActive, true)),
  });
}

export async function findRoomBookings(
  conn: DbOrTx,
  roomId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const conditions = [
    eq(roomBooking.roomId, roomId),
    eq(roomBooking.status, ROOM_BOOKING_STATUS.CONFIRMED),
    lte(roomBooking.startAt, endAt),
    gte(roomBooking.endAt, startAt),
  ];
  if (excludeBookingId) {
    conditions.push(ne(roomBooking.bookingId, excludeBookingId));
  }
  return conn
    .select()
    .from(roomBooking)
    .where(and(...conditions))
    .limit(1);
}

export async function insertRoomBooking(
  conn: DbOrTx,
  values: {
    roomId: string;
    bookingId: string;
    startAt: Date;
    endAt: Date;
    status: string;
  },
) {
  const [row] = await conn.insert(roomBooking).values(values).returning();
  return row!;
}

export function createRoomRepo(db: DbType) {
  return {
    findActiveRooms,
    insertRoom,
    findRoomById,
    findRoomBookings,
    insertRoomBooking,
  };
}
```

- [ ] **Step 4: Run repo test to verify it passes**

Run: `bun test packages/api/src/tests/unit/room.repo.test.ts`
Expected: PASS

- [ ] **Step 5: Update room.service.ts to use repo**

Modify `packages/api/src/modules/room/room.service.ts`. Remove the Drizzle imports. Accept `repo` in the factory:

```ts
import { ROOM_BOOKING_STATUS } from "../../shared/constants";
import { RoomNotFoundError, RoomBookingConflictError } from "./room.errors";
import type { RoomRepo } from "./room.repo";
import type { CreateRoomInput } from "./room.types";

export type RoomService = ReturnType<typeof createRoomService>;

export function createRoomService(repo: RoomRepo) {
  async function listActive() {
    return repo.findActiveRooms();
  }

  async function createRoom(input: CreateRoomInput) {
    return repo.insertRoom(input);
  }

  async function checkAvailability(
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
  ) {
    const existing = await repo.findRoomBookings(
      roomId,
      startAt,
      endAt,
      excludeBookingId,
    );
    return existing.length === 0;
  }

  async function assignRoom(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const roomRow = await repo.findRoomById(roomId);
    if (!roomRow) throw new RoomNotFoundError(roomId);

    const available = await checkAvailability(
      roomId,
      startAt,
      endAt,
      bookingId,
    );
    if (!available)
      throw new RoomBookingConflictError(
        roomId,
        startAt.toISOString(),
        endAt.toISOString(),
      );

    return repo.insertRoomBooking({
      roomId,
      bookingId,
      startAt,
      endAt,
      status: ROOM_BOOKING_STATUS.CONFIRMED,
    });
  }

  return { listActive, createRoom, checkAvailability, assignRoom };
}
```

- [ ] **Step 6: Update room/index.ts to wire repo**

Modify `packages/api/src/modules/room/index.ts`:

```ts
import type { DbType } from "../../lib/db";
import { createRoomRepo } from "./room.repo";
import { createRoomService } from "./room.service";
import { createRoomHandler } from "./room.handler";
import type { RoomService } from "./room.service";
import type { RoomHandler } from "./room.handler";

export type RoomModule = ReturnType<typeof createRoomModule>;

export function createRoomModule(deps: { db: DbType }) {
  const repo = createRoomRepo(deps.db);
  const service = createRoomService(repo);
  const handler = createRoomHandler(service);
  return { service, handler };
}

export type { RoomService, RoomHandler };
```

- [ ] **Step 7: Update room.service.test.ts mocks**

Modify `packages/api/src/tests/unit/room.service.test.ts` to construct `createRoomService(mockRepo)` instead of `createRoomService(mockDb)`.

- [ ] **Step 8: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add packages/api/src/modules/room/ packages/api/src/tests/unit/room.repo.test.ts packages/api/src/tests/unit/room.service.test.ts
git commit -m "refactor(api): extract room repo layer from service"
```

---

## Task 3: Tutor service — replace badRequest with domain errors

**Files:**

- Modify: `packages/api/src/modules/tutor/tutor.errors.ts`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts`
- Modify: `packages/api/src/tests/unit/tutor.service.test.ts`

**Note:** `submitForReview` takes `z.void()` — it validates the _existing DB profile_, not request input. Field-completeness CANNOT move to Zod. It's a business state check. Only the `badRequest()` (HTTP) throws become domain errors.

- [ ] **Step 1: Add domain error classes to tutor.errors.ts**

Add to `packages/api/src/modules/tutor/tutor.errors.ts` (after `AvailabilitySlotOverlapError`):

```ts
export class TutorProfileIncompleteError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, missingFields: string[]) {
    super(
      "TUTOR_PROFILE_INCOMPLETE",
      "All required fields must be filled before submission",
      { id, missingFields },
    );
  }
}

export class InvalidTutorPricingError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, pricingError: string) {
    super("INVALID_TUTOR_PRICING", "Tutor pricing validation failed", {
      id,
      pricingError,
    });
  }
}
```

Update `mapTutorError` to add:

```ts
if (err instanceof TutorProfileIncompleteError)
  return badRequest(err.message, err);
if (err instanceof InvalidTutorPricingError)
  return badRequest(err.message, err);
```

- [ ] **Step 2: Write failing tests for the new error classes**

Add to `packages/api/src/tests/unit/tutor.errors.test.ts`:

```ts
test("TutorProfileIncompleteError is a DomainError with correct code", () => {
  const err = new TutorProfileIncompleteError("tp1", ["displayName", "prices"]);
  expect(err).toBeInstanceOf(DomainError);
  expect(err.code).toBe("TUTOR_PROFILE_INCOMPLETE");
  expect(err.domain).toBe("tutor");
  expect(err.details).toEqual({
    id: "tp1",
    missingFields: ["displayName", "prices"],
  });
});

test("InvalidTutorPricingError is a DomainError with correct code", () => {
  const err = new InvalidTutorPricingError("tp1", "Price below floor");
  expect(err).toBeInstanceOf(DomainError);
  expect(err.code).toBe("INVALID_TUTOR_PRICING");
  expect(err.domain).toBe("tutor");
  expect(err.details).toEqual({ id: "tp1", pricingError: "Price below floor" });
});
```

Import the new classes at the top of the test file.

- [ ] **Step 3: Run tests to verify new error tests fail**

Run: `bun test packages/api/src/tests/unit/tutor.errors.test.ts`
Expected: PASS (error classes added in step 1 already exist) — but verify they're imported in the test.

- [ ] **Step 4: Update tutor.service.ts to throw domain errors**

Modify `packages/api/src/modules/tutor/tutor.service.ts`:

Remove `import { badRequest } from "../../lib/errors";`.

Add imports: `TutorProfileIncompleteError, InvalidTutorPricingError` to the existing import from `./tutor.errors`.

Replace `validateUpdateInput:43`:

```ts
const error = pricingPort.validatePrices(input.prices, modality);
if (error) {
  throw new InvalidTutorPricingError(profile.id, error);
}
```

Replace `validateSubmitForReview:71`:

```ts
const requiredFields = [
  profile.displayName,
  profile.shortBio,
  profile.credentialsSummary,
  profile.modality,
  profile.prices,
];
if (requiredFields.some((f) => !f)) {
  throw new TutorProfileIncompleteError(profile.id, [
    "displayName",
    "shortBio",
    "credentialsSummary",
    "modality",
    "prices",
  ]);
}
```

Replace `validateSubmitForReview:75`:

```ts
if (!profile.expertise || profile.expertise.length === 0) {
  throw new TutorProfileIncompleteError(profile.id, ["expertise"]);
}
```

Replace `validateSubmitForReview:88`:

```ts
if (profile.prices) {
  const modality = (profile.modality ?? MODALITY.ONLINE) as
    "online" | "offline" | "both";
  const error = pricingPort.validatePrices(
    profile.prices as Record<string, number>,
    modality,
  );
  if (error) {
    throw new InvalidTutorPricingError(profile.id, error);
  }
}
```

- [ ] **Step 5: Update tutor.service.test.ts assertions**

The existing tests at lines 156-178 use `.toThrow()` without specific classes for completeness checks. Update them:

```ts
test("throws TutorProfileIncompleteError for missing required fields", () => {
  expect(() =>
    validateSubmitForReview(
      makeProfile({ displayName: null }),
      mockPricingPort,
    ),
  ).toThrow(TutorProfileIncompleteError);
});

test("throws TutorProfileIncompleteError for empty expertise", () => {
  expect(() =>
    validateSubmitForReview(makeProfile({ expertise: [] }), mockPricingPort),
  ).toThrow(TutorProfileIncompleteError);
});

test("throws InvalidTutorPricingError when pricing validation fails", () => {
  expect(() => validateSubmitForReview(makeProfile(), failPricingPort)).toThrow(
    InvalidTutorPricingError,
  );
});
```

Import `TutorProfileIncompleteError, InvalidTutorPricingError` at the top.

Update `validateUpdateInput` tests similarly — the "throws when pricing validation fails" test should assert `InvalidTutorPricingError`.

- [ ] **Step 6: Run tutor tests**

Run: `bun test packages/api/src/tests/unit/tutor.service.test.ts packages/api/src/tests/unit/tutor.errors.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/modules/tutor/ packages/api/src/tests/unit/tutor.service.test.ts packages/api/src/tests/unit/tutor.errors.test.ts
git commit -m "refactor(api): replace tutor service badRequest throws with domain errors"
```

---

## Task 4: Payment service — remove ORPCError awareness

**Files:**

- Modify: `packages/api/src/modules/payment/payment.service.ts`
- Modify: `packages/api/src/tests/unit/payment.service.test.ts`

- [ ] **Step 1: Write a test that a provider ORPCError becomes PaymentProviderError**

Add to `packages/api/src/tests/unit/payment.service.test.ts` in the `createIntent` describe block:

```ts
test("wraps ORPCError from provider as PaymentProviderError (no longer re-thrown)", async () => {
  const { ORPCError } = await import("@orpc/server");
  const updatePaymentStatus = mock(async () => {});
  const repo = makeRepo({
    findPackageByCode: mock(async () => ({
      id: "pkg1",
      code: "pkg1",
      isActive: true,
      priceIdr: 50000,
      marks: 100,
    })),
    findPaymentByProviderReference: mock(async () => null),
    insertPayment: mock(async () => {}),
    updatePaymentStatus,
  });
  const db = makeDb();

  const provider = {
    ...makeProvider(),
    createIntent: mock(async () => {
      throw new ORPCError("INTERNAL", { message: "Internal provider error" });
    }),
  };

  const service = createPaymentService({
    db,
    wallet: makeWallet() as any,
    repo,
    provider: provider as any,
    providerName: "stub",
  });

  try {
    await service.createIntent("user1", "w1", "pkg1");
    expect(true).toBe(false);
  } catch (e: any) {
    expect(e).toBeInstanceOf(PaymentProviderError);
    expect(e.code).toBe("PAYMENT_PROVIDER_ERROR");
  }

  expect(updatePaymentStatus).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails (ORPCError currently passes through)**

Run: `bun test packages/api/src/tests/unit/payment.service.test.ts --grep "wraps ORPCError"`
Expected: FAIL — the ORPCError is re-thrown as-is (line 118 `if (error instanceof ORPCError) throw error`), so `expect(e).toBeInstanceOf(PaymentProviderError)` fails.

- [ ] **Step 3: Remove ORPCError awareness from payment.service.ts**

Modify `packages/api/src/modules/payment/payment.service.ts`:

Remove `import { ORPCError } from "@orpc/server";` (line 1).

In the `createIntent` catch block (lines 114-120), remove the `if (error instanceof ORPCError) throw error;` line:

```ts
try {
  const intent = await provider.createIntent({
    paymentId,
    amountIdr: pkg.priceIdr,
    providerReference,
  });
  return { paymentId, providerReference, checkoutUrl: intent.checkoutUrl };
} catch (error) {
  await repo.updatePaymentStatus(paymentId, {
    status: PAYMENT_STATUS.EXPIRED,
  });
  throw new PaymentProviderError(providerName, error);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/payment.service.test.ts`
Expected: PASS — the existing "throws PaymentProviderError when provider.createIntent throws" test (which throws a plain `Error`) still passes, and the new ORPCError test passes.

- [ ] **Step 5: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/payment/payment.service.ts packages/api/src/tests/unit/payment.service.test.ts
git commit -m "refactor(api): remove ORPCError awareness from payment service"
```

---

## Task 5: Admin-booking — use refund service port instead of refund repo

**Files:**

- Modify: `packages/api/src/modules/admin-booking/index.ts`
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts`
- Modify: `packages/api/src/modules/refund/refund.service.ts`
- Modify: `packages/api/src/services.ts`
- Modify: `packages/api/src/tests/unit/admin-booking.service.test.ts`

- [ ] **Step 1: Add AdminBookingRefundPort to admin-booking/index.ts**

Modify `packages/api/src/modules/admin-booking/index.ts`:

Remove `import type { RefundRepo } from "../refund/refund.repo";`.

Add a narrow port interface:

```ts
export interface AdminBookingRefundPort {
  createRefundRecord(
    db: DbOrTx,
    params: {
      paymentId: string;
      walletId: string;
      amountIdr: number;
      marks: number;
      reason: string;
      actorId: string;
    },
  ): Promise<void>;
}
```

Change `createAdminBookingModule` deps:

```ts
export function createAdminBookingModule(deps: {
  db: DbType;
  audit: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
}) {
  const repo = createAdminBookingRepo();
  const service = createAdminBookingService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
    wallet: deps.wallet,
    refund: deps.refund,
  });
  const handler = createAdminBookingHandler(service);
  return { service, handler };
}
```

- [ ] **Step 2: Update admin-booking.service.ts to use the port**

Modify `packages/api/src/modules/admin-booking/admin-booking.service.ts`:

Remove `import type { RefundRepo } from "../refund/refund.repo";`.

Change the factory signature to accept `refund: AdminBookingRefundPort` instead of `refundRepo`:

```ts
import type { AdminBookingAuditPort, AdminBookingWalletPort, AdminBookingRefundPort } from "./index";

export function createAdminBookingService(deps: {
  db: DbType;
  repo: AdminBookingRepo;
  auditPort: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
}) {
  const { db, repo, auditPort, wallet, refund } = deps;
```

Replace `refundRepo.insertRefundRecord(tx, {...})` (line 246) with `refund.createRefundRecord(tx, {...})`.

- [ ] **Step 3: Add createRefundRecord method to refund.service.ts**

Modify `packages/api/src/modules/refund/refund.service.ts`. Add a method that wraps the repo call:

```ts
async function createRefundRecord(
  db: DbOrTx,
  params: {
    paymentId: string;
    walletId: string;
    amountIdr: number;
    marks: number;
    reason: string;
    actorId: string;
  },
): Promise<void> {
  await repo.insertRefundRecord(db, params);
}
```

Add it to the returned object:

```ts
return { createCorrection, listCorrections, createRefundRecord };
```

Update the `RefundService` type by re-exporting or ensuring `createRefundRecord` is part of the service's public API.

- [ ] **Step 4: Update services.ts wiring**

Modify `packages/api/src/services.ts`:

Remove the shared `refundRepo` pattern. Change the admin-booking wiring:

```ts
const refund = createRefundModule({
  db,
  audit: audit.service,
  wallet: wallet.service,
});

const adminBooking = createAdminBookingModule({
  db,
  audit: audit.service,
  wallet: wallet.service,
  refund: refund.service,
});
```

Remove `createRefundRepo` import and the `const refundRepo = createRefundRepo();` line.

Remove the `repo: refundRepo` from `createRefundModule` call (let it create its own repo internally — it already does `const repo = deps.repo ?? createRefundRepo()`).

- [ ] **Step 5: Update admin-booking.service.test.ts to mock the refund port**

Modify `packages/api/src/tests/unit/admin-booking.service.test.ts` — replace `refundRepo` mock with a `refund` port mock:

```ts
function makeRefundPort() {
  return { createRefundRecord: mock(async () => {}) };
}
```

Update the service construction to pass `refund: makeRefundPort()` instead of `refundRepo: makeRefundRepo()`.

- [ ] **Step 6: Run admin-booking tests**

Run: `bun test packages/api/src/tests/unit/admin-booking.service.test.ts`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/modules/admin-booking/ packages/api/src/modules/refund/refund.service.ts packages/api/src/services.ts packages/api/src/tests/unit/admin-booking.service.test.ts
git commit -m "refactor(api): admin-booking uses refund service port instead of refund repo directly"
```

---

## Task 6: Wallet repo — move getOrCreate and pagination to service

**Files:**

- Modify: `packages/api/src/modules/wallet/wallet.repo.ts`
- Modify: `packages/api/src/modules/wallet/wallet.service.ts`
- Modify: `packages/api/src/tests/unit/wallet.repo.test.ts`
- Modify: `packages/api/src/tests/unit/wallet.service.test.ts`

- [ ] **Step 1: Add upsert primitive and findLedgerEntries to wallet.repo.ts**

Modify `packages/api/src/modules/wallet/wallet.repo.ts`:

Add an `upsert` function (uses root `db`, race-safe via `ON CONFLICT DO NOTHING`):

```ts
export async function upsert(
  db: DbType,
  values: {
    userId: string;
    totalBalance: number;
    heldBalance: number;
    availableBalance: number;
  },
): Promise<WalletSnapshot | null> {
  const [created] = await db
    .insert(wallet)
    .values(values)
    .onConflictDoNothing()
    .returning();
  return created ? (created as WalletSnapshot) : null;
}
```

Add `findLedgerEntries` that returns raw rows (no pagination math):

```ts
export async function findLedgerEntries(
  conn: DbOrTx,
  walletId: string,
  opts: {
    limit: number;
    cursor?: string;
    bookingId?: string;
    eventKey?: string;
  },
) {
  const conditions = [eq(ledgerEntry.walletId, walletId)];
  if (opts.bookingId) {
    conditions.push(eq(ledgerEntry.bookingId, opts.bookingId));
  }
  if (opts.eventKey) {
    conditions.push(eq(ledgerEntry.eventKey, opts.eventKey));
  }
  return conn
    .select()
    .from(ledgerEntry)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntry.createdAt))
    .limit(opts.limit + 1);
}
```

Remove the old `listLedger` function (lines 212-232) — it's replaced by `findLedgerEntries` + service pagination math.

Remove the `getOrCreate` orchestration method from `createWalletRepo` (lines 239-268). Add `upsert` and `findLedgerEntries` to the returned object instead.

- [ ] **Step 2: Move getOrCreate and listLedger to wallet.service.ts**

Modify `packages/api/src/modules/wallet/wallet.service.ts`:

Update `getOrCreate`:

```ts
async function getOrCreate(userId: string): Promise<WalletSnapshot> {
  const existing = await repo.getByUserId(db, userId);
  if (existing) return existing;
  const created = await repo.upsert(db, {
    userId,
    totalBalance: 0,
    heldBalance: 0,
    availableBalance: 0,
  });
  if (created) return created;
  const afterConflict = await repo.getByUserId(db, userId);
  if (!afterConflict) throw new WalletNotFoundError(userId);
  return afterConflict;
}
```

Update `listLedger` to compute pagination from `repo.findLedgerEntries`:

```ts
async function listLedger(walletId: string, opts?: LedgerQueryOptions) {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const rows = await repo.findLedgerEntries(db, walletId, {
    limit,
    cursor: opts?.cursor,
    bookingId: opts?.bookingId,
    eventKey: opts?.eventKey,
  });
  const items = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
  return { items, nextCursor };
}
```

- [ ] **Step 3: Update wallet.repo.test.ts**

Modify `packages/api/src/tests/unit/wallet.repo.test.ts`:

- Remove tests for the old `getOrCreate` method and `listLedger` pagination math.
- Add tests for `upsert` (returns created on insert, `null` on conflict).
- Add tests for `findLedgerEntries` (returns raw rows, respects limit + 1).

- [ ] **Step 4: Update wallet.service.test.ts**

Modify `packages/api/src/tests/unit/wallet.service.test.ts`:

- Add test: `getOrCreate` returns existing wallet when found.
- Add test: `getOrCreate` creates new wallet via `upsert` when not found.
- Add test: `getOrCreate` re-fetches when `upsert` returns null (conflict case).
- Add test: `listLedger` computes `nextCursor` from `limit + 1` rows.

- [ ] **Step 5: Run wallet tests**

Run: `bun test packages/api/src/tests/unit/wallet.repo.test.ts packages/api/src/tests/unit/wallet.service.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/modules/wallet/ packages/api/src/tests/unit/wallet.repo.test.ts packages/api/src/tests/unit/wallet.service.test.ts
git commit -m "refactor(api): move wallet getOrCreate and pagination from repo to service"
```

---

## Task 7: Move remaining hardcoded repo filters to service opts

**Files:**

- Modify: `packages/api/src/modules/tutor/tutor.repo.ts`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts`
- Modify: `packages/api/src/modules/booking/booking.repo.ts`
- Modify: `packages/api/src/modules/booking/booking.service.ts`
- Modify: `packages/api/src/modules/tutor-discovery/discovery.repo.ts`
- Modify: `packages/api/src/modules/tutor-discovery/discovery.service.ts`
- Modify: `packages/api/src/modules/achievement/achievement.repo.ts`
- Modify: `packages/api/src/modules/achievement/achievement.service.ts`

- [ ] **Step 1: Move tutor.repo future-only filter to opts**

Modify `packages/api/src/modules/tutor/tutor.repo.ts` `listAvailability`:

```ts
export async function listAvailability(
  conn: DbOrTx,
  userId: string,
  opts?: { from?: Date },
) {
  const conditions = [
    eq(availabilitySlot.tutorId, userId),
    eq(availabilitySlot.isActive, true),
  ];
  if (opts?.from) {
    conditions.push(gte(availabilitySlot.startDate, opts.from));
  }
  return conn
    .select()
    .from(availabilitySlot)
    .where(and(...conditions));
}
```

Modify `packages/api/src/modules/tutor/tutor.service.ts` `listAvailability`:

```ts
async function listAvailability(userId: string) {
  return tutorRepo.listAvailability(db, userId, { from: new Date() });
}
```

- [ ] **Step 2: Move booking.repo findTutorProfile published-only filter to opts**

Modify `packages/api/src/modules/booking/booking.repo.ts` `findTutorProfile`:

```ts
async function findTutorProfile(
  conn: DbOrTx,
  tutorId: string,
  opts?: { publishedOnly?: boolean },
) {
  const conditions = [eq(tutorProfile.userId, tutorId)];
  if (opts?.publishedOnly) {
    conditions.push(
      eq(tutorProfile.onboardingStatus, ONBOARDING_STATUS.PUBLISHED),
    );
  }
  return (
    conn.query.tutorProfile.findFirst({ where: and(...conditions) }) ?? null
  );
}
```

Modify `packages/api/src/modules/booking/booking.service.ts` at all `findTutorProfile` call sites to pass `{ publishedOnly: true }`.

- [ ] **Step 3: Move discovery.repo defaults to service**

Modify `packages/api/src/modules/tutor-discovery/discovery.repo.ts` `listPublished`:

Remove lines 15-16 (`const limit = input.limit ?? 20;` and `const offset = input.offset ?? 0;`). Use `input.limit` and `input.offset` directly (they're now required to be numbers, or undefined — Drizzle accepts undefined for limit/offset).

Modify `packages/api/src/modules/tutor-discovery/discovery.service.ts` `listPublished`:

```ts
async function listPublished(opts: ListPublishedInput = {}) {
  const profiles = await repo.listPublished({
    ...opts,
    limit: opts.limit ?? 20,
    offset: opts.offset ?? 0,
  });
  return profiles.map(buildProjection);
}
```

- [ ] **Step 4: Move achievement.repo fallbacks to service**

Modify `packages/api/src/modules/achievement/achievement.repo.ts` `insert`:

Change lines 53-57 to pass values directly without `|| null` / `|| []` fallbacks:

```ts
async function insert(conn: DbOrTx, params: InsertAchievementParams) {
  const [result] = await conn
    .insert(achievement)
    .values({
      userId: params.userId,
      eventName: params.eventName,
      category: params.category,
      award: params.award,
      level: params.level,
      eventDate: params.eventDate ?? null,
      location: params.location ?? null,
      description: params.description ?? null,
      subjects: params.subjects ?? [],
      imageUrl: params.imageUrl ?? null,
    })
    .returning();
  return result;
}
```

Note: `?? null` and `?? []` (nullish coalescing) are acceptable — they handle `undefined` not `|| null` (which also catches empty string / 0). If the current code uses `||`, change to `??` for null-safety. If it already uses `||`, this is the fix. If the values are always provided by the service, remove the fallbacks entirely and require the service to pass complete values.

- [ ] **Step 5: Run tests**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass. Update repo tests if they assert the old default behavior.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/tutor/ packages/api/src/modules/booking/ packages/api/src/modules/tutor-discovery/ packages/api/src/modules/achievement/
git commit -m "refactor(api): move remaining business filters and defaults from repos to services"
```

---

## Task 8: Refund service — remove dead amount check

**Files:**

- Modify: `packages/api/src/modules/refund/refund.service.ts`
- Modify: `packages/api/src/tests/unit/refund.service.test.ts`

- [ ] **Step 1: Remove the dead check from refund.service.ts**

Modify `packages/api/src/modules/refund/refund.service.ts` lines 31-35:

Delete:

```ts
if (input.amount <= 0)
  throw new InvalidRefundAmountError(input.amount, "Amount must be positive");
```

- [ ] **Step 2: Update refund.service.test.ts**

Modify `packages/api/src/tests/unit/refund.service.test.ts`:

Delete the test at lines 78-97 ("throws badRequest when amount is zero or negative") — it's now unreachable (Zod's `.positive()` rejects before the service runs).

Add a comment or a router-level test note that Zod handles this. If a router test exists, verify it asserts `.positive()`.

Remove the `InvalidRefundAmountError` import from the test file if no longer used.

- [ ] **Step 3: Run refund tests**

Run: `bun test packages/api/src/tests/unit/refund.service.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/refund/refund.service.ts packages/api/src/tests/unit/refund.service.test.ts
git commit -m "refactor(api): remove dead amount check from refund service (Zod already validates)"
```

---

## Task 9: Create notification.errors.ts

**Files:**

- Create: `packages/api/src/modules/notification/notification.errors.ts`
- Modify: `packages/api/src/modules/notification/notification.handler.ts`
- Modify: `packages/api/src/modules/notification/notification.service.ts`
- Create: `packages/api/src/tests/unit/notification.errors.test.ts`
- Modify: `packages/api/src/tests/unit/notification.handlers.test.ts`

- [ ] **Step 1: Write failing test for notification.errors.ts**

Create `packages/api/src/tests/unit/notification.errors.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { DomainError } from "../../modules/../../lib/domain-errors";
import {
  NotificationNotFoundError,
  mapNotificationError,
} from "../../modules/notification/notification.errors";
import { ORPCError } from "@orpc/server";

describe("notification.errors", () => {
  test("NotificationNotFoundError is a DomainError with correct code", () => {
    const err = new NotificationNotFoundError("n1");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("NOTIFICATION_NOT_FOUND");
    expect(err.domain).toBe("notification");
    expect(err.details).toEqual({ notificationId: "n1" });
    expect(err.name).toBe("NotificationNotFoundError");
  });

  test("mapNotificationError maps NotificationNotFoundError to 404", () => {
    const err = new NotificationNotFoundError("n1");
    const result = mapNotificationError(err);
    expect(result).toBeInstanceOf(ORPCError);
    expect(result.status).toBe(404);
  });

  test("mapNotificationError falls back to 500 for unknown DomainError", () => {
    class UnknownError extends DomainError {
      readonly domain = "notification";
      constructor() {
        super("UNKNOWN", "Unknown", {});
      }
    }
    const result = mapNotificationError(new UnknownError());
    expect(result).toBeInstanceOf(ORPCError);
    expect(result.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/tests/unit/notification.errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create notification.errors.ts**

Create `packages/api/src/modules/notification/notification.errors.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, internalServerError } from "../../lib/errors";

export class NotificationNotFoundError extends DomainError {
  readonly domain = "notification";
  constructor(notificationId: string) {
    super("NOTIFICATION_NOT_FOUND", "Notification not found", {
      notificationId,
    });
  }
}

export function mapNotificationError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof NotificationNotFoundError)
    return notFound(err.message, err);
  return internalServerError(err.message, err);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api/src/tests/unit/notification.errors.test.ts`
Expected: PASS

- [ ] **Step 5: Update notification.handler.ts to import from errors file**

Modify `packages/api/src/modules/notification/notification.handler.ts`:

Remove the inline `mapNotificationError` definition (lines 12-14) and the `internalServerError` import.

Add:

```ts
import { mapNotificationError } from "./notification.errors";
```

Remove:

```ts
import { DomainError } from "../../lib/domain-errors";
import { internalServerError } from "../../lib/errors";
```

- [ ] **Step 6: Update notification.service.ts to throw NotificationNotFoundError**

Modify `packages/api/src/modules/notification/notification.service.ts`:

First, add a `findNotificationByIdForUser` method to `notification.repo.ts`:

```ts
export async function findNotificationByIdForUser(
  conn: DbOrTx,
  id: string,
  userId: string,
) {
  const [row] = await conn
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .limit(1);
  return row ?? null;
}
```

Add it to `createNotificationRepo` return object.

Then modify `markAsRead` in `notification.service.ts` to check existence via the repo and throw `NotificationNotFoundError`:

```ts
async function markAsRead(userId: string, id: string): Promise<void> {
  const existing = await repo.findNotificationByIdForUser(db, id, userId);
  if (!existing) throw new NotificationNotFoundError(id);
  await repo.updateReadStatus(db, id, userId, true);
}
```

Import `NotificationNotFoundError` from `./notification.errors`.

Note: `markAllAsRead` does not need this check — it's a bulk update that no-ops if nothing matches. Only `markAsRead` (single-notification) needs the existence check.

- [ ] **Step 7: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/modules/notification/ packages/api/src/tests/unit/notification.errors.test.ts packages/api/src/tests/unit/notification.handlers.test.ts
git commit -m "refactor(api): add notification.errors.ts, extract mapper from handler"
```

---

## Task 10: Fix fallback.provider.ts double cast

**Files:**

- Modify: `packages/api/src/modules/meeting/fallback.provider.ts`
- Create or modify: `packages/api/src/tests/unit/fallback.provider.test.ts`

- [ ] **Step 1: Fix the double cast**

Modify `packages/api/src/modules/meeting/fallback.provider.ts`:

Remove the alias import. Change line 3:

```ts
import {
  meetingEvent,
  type meetingEvent as meetingEventTable,
} from "@cogito-app/db/schema";
```

to:

```ts
import { meetingEvent } from "@cogito-app/db/schema";
```

Change line 34:

```ts
return row as unknown as typeof meetingEventTable.$inferSelect;
```

to:

```ts
return row as typeof meetingEvent.$inferSelect;
```

This is a single valid cast (DB row → inferred select type), not a double `as unknown as` cast. The alias was the root cause — removing it aligns the types.

- [ ] **Step 2: Write/verify test for fallback provider**

If `packages/api/src/tests/unit/fallback.provider.test.ts` doesn't exist, create it:

```ts
import { describe, test, expect, mock } from "bun:test";
import { createFallbackMeetingProvider } from "../../modules/meeting/fallback.provider";

function makeDb() {
  return {
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [
          {
            id: "me1",
            bookingId: "b1",
            provider: "manual",
            status: "manual",
            meetingUrl: null,
            externalEventId: null,
          },
        ]),
      })),
    })),
  } as any;
}

describe("FallbackMeetingProvider", () => {
  test("createEvent returns a typed MeetingEvent", async () => {
    const provider = createFallbackMeetingProvider(makeDb());
    const result = await provider.createEvent("b1");
    expect(result.id).toBe("me1");
    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("manual");
  });
});
```

If the test file exists, verify it still passes after the type fix.

- [ ] **Step 3: Run tests**

Run: `bun test packages/api/src/tests/unit/fallback.provider.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `bun run check && bun run check-types && bun run build && bun test`
Expected: All pass. No `as unknown as` in fallback.provider.ts.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/meeting/fallback.provider.ts packages/api/src/tests/unit/fallback.provider.test.ts
git commit -m "fix(api): remove double type cast in meeting fallback provider"
```

---

## Task 11: Test coverage push

**Files:**

- Various test files in `packages/api/src/tests/unit/`

- [ ] **Step 1: Run coverage report**

Run: `bun run test:coverage`

- [ ] **Step 2: Review coverage for touched modules**

Review the coverage report for: `notification`, `room`, `tutor`, `payment`, `admin-booking`, `wallet`, `refund`. Identify any new/modified file below 100%.

- [ ] **Step 3: Add tests for uncovered branches**

For each uncovered branch in a new/modified file:

- If it's a business-rule branch (error path, state transition), add a test.
- If it's a trivial defensive branch (catch that re-throws), document the gap in the commit message and move on.
- Focus max effort on services, handlers, repos, error files.

- [ ] **Step 4: Re-run coverage**

Run: `bun run test:coverage`
Expected: ≥95% on touched modules, best-effort 100% on new files.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/tests/
git commit -m "test(api): close coverage gaps for phase 2.5 touched modules"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run all grep gates**

```bash
grep -rn "from.*lib/errors" packages/api/src/modules/ --include="*.service.ts"
grep -rn "from.*lib/errors" packages/api/src/modules/ --include="*.repo.ts"
grep -rn "from.*\.\./[a-z-]*/[a-z-]*\.repo" packages/api/src/modules/ --include="*.service.ts" --include="*.handler.ts"
grep -rn "db\.\(select\|insert\|update\|delete\|query\)" packages/api/src/modules/notification/notification.service.ts packages/api/src/modules/room/room.service.ts
grep -rn "as unknown as" packages/api/src/modules/ packages/api/src/lib/
```

Expected: Zero matches for each.

- [ ] **Step 2: Verify all 14 error files present**

Run:

```bash
ls packages/api/src/modules/*/ | grep "\.errors\.ts" | wc -l
```

Expected: 14.

- [ ] **Step 3: Verify no HTTP error throws in services**

```bash
grep -rn "throw \(badRequest\|notFound\|forbidden\|conflict\|serviceUnavailable\|internalServerError\)" packages/api/src/modules/ --include="*.service.ts"
```

Expected: Zero matches.

- [ ] **Step 4: Full CI**

Run: `bun run check && bun run check-types && bun run build && bun test && bun run test:coverage`
Expected: All pass.

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "refactor(api): consolidation phase 2.5 — gaps and corrections complete"
git push origin improvement/consolidation
```
