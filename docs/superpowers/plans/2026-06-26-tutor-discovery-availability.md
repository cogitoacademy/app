# Phase 2: Tutor Discovery & Availability — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `availabilitySlot` table, tutor availability CRUD, and enhance discovery listing/profile with upcoming slots.

**Architecture:** New schema file `availability-slot.ts`. Tutor module gets availability methods. Discovery module fetches upcoming slots per profile. Projection only needed fields.

**Tech Stack:** Drizzle, oRPC, Zod.

---

## File Structure

**Create:**

- `packages/db/src/schema/availability-slot.ts`
- `packages/api/src/modules/tutor/availability.types.ts`
- `packages/api/src/tests/integration/tutor-availability.test.ts`
- `packages/api/src/tests/integration/tutor-discovery.test.ts`

**Modify:**

- `packages/db/src/schema/index.ts`
- `packages/db/src/migrations/` (new migration)
- `packages/api/src/modules/tutor/tutor.service.ts`
- `packages/api/src/modules/tutor/tutor.router.ts`
- `packages/api/src/modules/tutor/tutor.types.ts`
- `packages/api/src/modules/tutor-discovery/discovery.service.ts`
- `packages/api/src/modules/tutor-discovery/discovery.router.ts`
- `packages/api/src/modules/tutor-discovery/discovery.types.ts`
- `docs/CONTEXT.md`
- `docs/planning-phase-0-backend-mvp/PLAN.md`

---

## Task 1: availabilitySlot schema + migration

**Files:**

- Create: `packages/db/src/schema/availability-slot.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create availability-slot.ts**

```ts
import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";

export const availabilitySlot = pgTable(
  "availability_slot",
  {
    id: uuidPrimaryKey,
    tutorId: text("tutor_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    modality: text("modality").notNull(),
    isRecurring: boolean("is_recurring").default(false).notNull(),
    recurrenceRule: text("recurrence_rule"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      "availability_slot_modality_check",
      sql`${table.modality} IN ('online','offline','both')`,
    ),
    index("availability_slot_tutorId_startDate_idx").on(
      table.tutorId,
      table.startDate,
    ),
    uniqueIndex("availability_slot_overlap_idx").on(
      table.tutorId,
      table.startDate,
      table.endDate,
    ),
  ],
);

export const availabilitySlotRelations = relations(
  availabilitySlot,
  ({ one }) => ({
    tutor: one(user, {
      fields: [availabilitySlot.tutorId],
      references: [user.id],
    }),
  }),
);
```

- [ ] **Step 2: Export from schema/index.ts**

```ts
export * from "./availability-slot";
```

- [ ] **Step 3: Generate migration**

Run: `bun run db:generate`  
Expected: `packages/db/src/migrations/0002_*.sql`

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/availability-slot.ts packages/db/src/schema/index.ts packages/db/src/migrations/
git commit -m "feat(db): add availabilitySlot schema"
```

---

## Task 2: Tutor availability CRUD

**Files:**

- Create: `packages/api/src/modules/tutor/availability.types.ts`
- Modify: `packages/api/src/modules/tutor/tutor.service.ts`
- Modify: `packages/api/src/modules/tutor/tutor.router.ts`

- [ ] **Step 1: Create availability.types.ts**

```ts
import { z } from "zod";

export const upsertAvailabilityInput = z.object({
  id: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  modality: z.enum(["online", "offline", "both"]),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const deleteAvailabilityInput = z.object({
  id: z.string(),
});
```

- [ ] **Step 2: Add methods to tutor.service.ts**

```ts
import { eq, and, gte, lte, ne } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";
import { conflict } from "../../lib/errors";

export interface UpsertAvailabilityInput {
  id?: string;
  startDate: string;
  endDate: string;
  modality: "online" | "offline" | "both";
  isRecurring?: boolean;
  recurrenceRule?: string;
  isActive?: boolean;
}

// inside createTutorService:
async function listAvailability(userId: string) {
  return db
    .select()
    .from(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.tutorId, userId),
        eq(availabilitySlot.isActive, true),
      ),
    )
    .orderBy(availabilitySlot.startDate);
}

async function upsertAvailability(
  userId: string,
  input: UpsertAvailabilityInput,
) {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (end <= start) throw badRequest("endDate must be after startDate");

  const overlapping = await db
    .select()
    .from(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.tutorId, userId),
        eq(availabilitySlot.isActive, true),
        input.id ? ne(availabilitySlot.id, input.id) : undefined,
        lte(availabilitySlot.startDate, end),
        gte(availabilitySlot.endDate, start),
      ),
    )
    .limit(1);

  if (overlapping.length > 0) {
    throw conflict("Availability window overlaps with an existing slot");
  }

  if (input.id) {
    const [updated] = await db
      .update(availabilitySlot)
      .set({
        startDate: start,
        endDate: end,
        modality: input.modality,
        isRecurring: input.isRecurring ?? false,
        recurrenceRule: input.recurrenceRule ?? null,
        isActive: input.isActive ?? true,
      })
      .where(
        and(
          eq(availabilitySlot.id, input.id),
          eq(availabilitySlot.tutorId, userId),
        ),
      )
      .returning();
    if (!updated) throw notFound("Availability slot not found");
    return updated;
  }

  const [created] = await db
    .insert(availabilitySlot)
    .values({
      tutorId: userId,
      startDate: start,
      endDate: end,
      modality: input.modality,
      isRecurring: input.isRecurring ?? false,
      recurrenceRule: input.recurrenceRule ?? null,
      isActive: input.isActive ?? true,
    })
    .returning();
  return created!;
}

async function deleteAvailability(userId: string, id: string) {
  const [deleted] = await db
    .delete(availabilitySlot)
    .where(
      and(eq(availabilitySlot.id, id), eq(availabilitySlot.tutorId, userId)),
    )
    .returning();
  if (!deleted) throw notFound("Availability slot not found");
  return { id: deleted.id };
}
```

Add `listAvailability`, `upsertAvailability`, `deleteAvailability` to return object.

- [ ] **Step 3: Add routes to tutor.router.ts**

```ts
import { upsertAvailabilityInput, deleteAvailabilityInput } from "./availability.types";

listAvailability: protectedProcedure
  .route({ method: "POST", path: "/tutor/availability/list", tags: ["Tutor"], summary: "List availability" })
  .input(z.void())
  .handler(({ context }) => context.services.tutor.listAvailability(context.session.user.id)),

upsertAvailability: protectedProcedure
  .route({ method: "POST", path: "/tutor/availability/upsert", tags: ["Tutor"], summary: "Upsert availability" })
  .input(upsertAvailabilityInput)
  .handler(({ context, input }) => context.services.tutor.upsertAvailability(context.session.user.id, input)),

deleteAvailability: protectedProcedure
  .route({ method: "POST", path: "/tutor/availability/delete", tags: ["Tutor"], summary: "Delete availability" })
  .input(deleteAvailabilityInput)
  .handler(({ context, input }) => context.services.tutor.deleteAvailability(context.session.user.id, input.id)),
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/tutor/
git commit -m "feat(tutor): add availability CRUD"
```

---

## Task 3: Discovery enhancement

**Files:**

- Modify: `packages/api/src/modules/tutor-discovery/discovery.service.ts`
- Modify: `packages/api/src/modules/tutor-discovery/discovery.router.ts`
- Modify: `packages/api/src/modules/tutor-discovery/discovery.types.ts`

- [ ] **Step 1: Add getProfileInput type**

```ts
export const getProfileInput = z.object({
  tutorId: z.string(),
});
```

- [ ] **Step 2: Add getProfile route**

```ts
getProfile: protectedProcedure
  .route({ method: "POST", path: "/tutors/profile/get", tags: ["Tutors"], summary: "Get published tutor profile" })
  .input(getProfileInput)
  .handler(({ context, input }) => context.services.discovery.getProfile(input.tutorId)),
```

- [ ] **Step 3: Enhance discovery.service.ts**

```ts
import { gte, eq, and } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";

async function upcomingSlots(tutorUserId: string, limit = 3) {
  const now = new Date();
  return db
    .select()
    .from(availabilitySlot)
    .where(
      and(
        eq(availabilitySlot.tutorId, tutorUserId),
        eq(availabilitySlot.isActive, true),
        gte(availabilitySlot.startDate, now),
      ),
    )
    .orderBy(availabilitySlot.startDate)
    .limit(limit);
}

// in listPublished mapper:
const slots = await upcomingSlots(p.userId);
return {
  ...existing fields,
  upcomingSlots: slots,
};

// in getProfile:
const slots = await db.select().from(availabilitySlot).where(...future active);
return { ...profile, slots };
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/modules/tutor-discovery/
git commit -m "feat(discovery): add getProfile and upcoming availability slots"
```

---

## Task 4: Tests

**Files:**

- Create: `packages/api/src/tests/integration/tutor-availability.test.ts`
- Create: `packages/api/src/tests/integration/tutor-discovery.test.ts`

- [ ] **Step 1: Tutor availability tests**

TDD or direct:

- Create slot → success
- Overlapping slot → `CONFLICT`
- Update slot → success
- Delete slot → not found on list
- List returns own slots ordered

- [ ] **Step 2: Discovery tests**

- Create published tutor + slots → `listPublished` includes `upcomingSlots`
- `getProfile` returns slots + required fields
- Draft profile → `getProfile` returns 404

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/tests/integration/tutor-availability.test.ts packages/api/src/tests/integration/tutor-discovery.test.ts
git commit -m "test(tutor): add availability and discovery integration tests"
```

---

## Task 5: Docs + verification

- [ ] **Update docs/CONTEXT.md** — add availabilitySlot table, tutor availability routes, discovery getProfile.
- [ ] **Update PLAN.md** — mark Phase 2 complete.
- [ ] **Run `bun run check-types`** — green.
- [ ] **Run `bun run check`** — green (warnings acceptable).
- [ ] **Commit**

```bash
git add docs/CONTEXT.md docs/planning-phase-0-backend-mvp/PLAN.md
git commit -m "docs: update Phase 2 context and status"
```
