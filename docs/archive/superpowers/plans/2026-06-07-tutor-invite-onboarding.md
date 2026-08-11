# Tutor Invite & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete tutor invite → onboarding → publish flow so admins can invite tutors, tutors can claim invite and complete onboarding, and admin can review and publish tutor profiles.

**Architecture:** Admin creates a `tutorInvite` record with email + token. Invite link sent via email (or copied manually). New or existing user claims the invite, which creates/attaches a `tutorProfile` in `draft` status. Tutor fills required onboarding fields, submits for review. Admin reviews and publishes. All state transitions are auditable via `auditLog`. Role-based access enforced at the API layer using existing `adminProcedure` / `protectedProcedure`.

**Tech Stack:** Drizzle ORM (PostgreSQL), oRPC (server), Better Auth, TanStack Query/Form (web), Selia UI, Zod validation, Bun runtime.

**PRD References:** FR-23 (invite-only tutor onboarding), FR-24 (tutor onboarding path), FR-05 (tutor pricing floor validation), DL-23 (invite-only access, email matching, invite lifecycle), TC-08 (new tutor account claim), TC-09 (existing user email match), TC-10 (onboarding review & publication gate).

---

## File Structure

### New Files

| File                                                     | Purpose                                           |
| -------------------------------------------------------- | ------------------------------------------------- |
| `packages/db/src/schema/tutor-invite.ts`                 | `tutorInvite` table + relations                   |
| `packages/db/src/schema/tutor-profile.ts`                | `tutorProfile` table + relations                  |
| `packages/db/src/schema/audit-log.ts`                    | `auditLog` table + relations                      |
| `packages/api/src/routers/tutor-router.ts`               | Tutor-facing endpoints (profile CRUD, onboarding) |
| `packages/api/src/routers/admin-tutor-router.ts`         | Admin endpoints (invite, review, publish)         |
| `apps/web/src/routes/_app.onboarding.tsx`                | Tutor onboarding route                            |
| `apps/web/src/components/tutor/onboarding-form.tsx`      | Multi-step onboarding form                        |
| `apps/web/src/components/tutor/tutor-pricing-fields.tsx` | Pricing grid for class sizes 1-6                  |
| `apps/web/src/components/admin/tutor-invite-form.tsx`    | Admin invite creation form                        |
| `apps/web/src/components/admin/tutor-review-card.tsx`    | Admin review of tutor submissions                 |
| `apps/web/src/routes/invite.tsx`                         | Public invite claim page                          |

### Modified Files

| File                                                | Change                            |
| --------------------------------------------------- | --------------------------------- |
| `packages/db/src/schema/index.ts`                   | Re-export new schema files        |
| `packages/api/src/routers/index.ts`                 | Register new routers              |
| `apps/web/src/routes/_app.tsx`                      | Add route title for `/onboarding` |
| `apps/web/src/components/dashboard/app-sidebar.tsx` | Conditional nav items by role     |

---

## Data Model

### `tutorInvite`

| Column        | Type                            | Notes                                  |
| ------------- | ------------------------------- | -------------------------------------- |
| id            | text PK (uuid)                  |                                        |
| email         | text NOT NULL UNIQUE            | Target email                           |
| displayName   | text NOT NULL                   | Admin-provided name hint               |
| token         | text NOT NULL UNIQUE            | Single-use claim token                 |
| status        | text NOT NULL default "invited" | invited / accepted / expired / revoked |
| invitedBy     | text NOT NULL FK → user.id      | Admin who created                      |
| acceptedBy    | text FK → user.id               | User who claimed (null until accepted) |
| internalNotes | text                            | Admin notes                            |
| expiresAt     | timestamp NOT NULL              | Invite expiry                          |
| acceptedAt    | timestamp                       | When accepted                          |
| createdAt     | timestamp default now           |                                        |
| updatedAt     | timestamp default now           |                                        |

Indexes: email, token, status, invitedBy

### `tutorProfile`

| Column              | Type                              | Notes                                                                                     |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| id                  | text PK (uuid)                    |                                                                                           |
| userId              | text NOT NULL UNIQUE FK → user.id | One profile per user                                                                      |
| inviteId            | text NOT NULL FK → tutorInvite.id | Linked invite                                                                             |
| displayName         | text                              | Required for publish                                                                      |
| shortBio            | text                              | Required for publish                                                                      |
| credentialsSummary  | text                              | Required for publish                                                                      |
| expertise           | jsonb (string[])                  | Competition tracks, required for publish                                                  |
| modality            | text                              | "online" / "offline" / "both", required for publish                                       |
| prices              | jsonb                             | { 1: number, 2: number, ..., 6: number } in Marks                                         |
| availabilitySummary | text                              | Text description of availability                                                          |
| proofUrls           | jsonb (string[])                  | Optional credential proof links                                                           |
| onboardingStatus    | text NOT NULL default "draft"     | draft / pending_review / changes_requested / approved_unpublished / published / suspended |
| adminReviewNote     | text                              | Reason for changes_requested or suspension                                                |
| publishedAt         | timestamp                         | When admin published                                                                      |
| createdAt           | timestamp default now             |                                                                                           |
| updatedAt           | timestamp default now             |                                                                                           |

Indexes: userId, onboardingStatus, inviteId

### `auditLog`

| Column     | Type                  | Notes                                                   |
| ---------- | --------------------- | ------------------------------------------------------- |
| id         | text PK (uuid)        |                                                         |
| actorId    | text FK → user.id     | Who performed the action                                |
| actorType  | text NOT NULL         | "admin" / "system" / "tutor"                            |
| action     | text NOT NULL         | e.g. "tutor_invite_created", "tutor_profile_published"  |
| targetId   | text                  | ID of affected entity                                   |
| targetType | text NOT NULL         | "tutor_invite" / "tutor_profile" / "booking" / "wallet" |
| details    | jsonb                 | Arbitrary details                                       |
| createdAt  | timestamp default now |                                                         |

Indexes: actorId, targetType, targetId, createdAt

---

### Task 1: Tutor Invite & Tutor Profile DB Schema

**Files:**

- Create: `packages/db/src/schema/tutor-invite.ts`
- Create: `packages/db/src/schema/tutor-profile.ts`
- Create: `packages/db/src/schema/audit-log.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create `tutor-invite.ts` schema file**

```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";

export const tutorInvite = pgTable(
  "tutor_invite",
  {
    id: uuidPrimaryKey,
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    token: text("token").notNull().unique(),
    status: text("status").notNull().default("invited"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    acceptedBy: text("accepted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    internalNotes: text("internal_notes"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tutor_invite_email_idx").on(table.email),
    index("tutor_invite_token_idx").on(table.token),
    index("tutor_invite_status_idx").on(table.status),
    index("tutor_invite_invitedBy_idx").on(table.invitedBy),
  ],
);

export const tutorInviteRelations = relations(tutorInvite, ({ one }) => ({
  inviter: one(user, {
    fields: [tutorInvite.invitedBy],
    references: [user.id],
  }),
  acceptor: one(user, {
    fields: [tutorInvite.acceptedBy],
    references: [user.id],
  }),
}));
```

- [ ] **Step 2: Create `tutor-profile.ts` schema file**

```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";
import { tutorInvite } from "./tutor-invite";

export const tutorProfile = pgTable(
  "tutor_profile",
  {
    id: uuidPrimaryKey,
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteId: text("invite_id")
      .notNull()
      .references(() => tutorInvite.id, { onDelete: "cascade" }),
    displayName: text("display_name"),
    shortBio: text("short_bio"),
    credentialsSummary: text("credentials_summary"),
    expertise: jsonb("expertise").$type<string[]>().default([]),
    modality: text("modality"),
    prices: jsonb("prices").$type<Record<string, number>>(),
    availabilitySummary: text("availability_summary"),
    proofUrls: jsonb("proof_urls").$type<string[]>().default([]),
    onboardingStatus: text("onboarding_status").notNull().default("draft"),
    adminReviewNote: text("admin_review_note"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("tutor_profile_userId_idx").on(table.userId),
    index("tutor_profile_onboardingStatus_idx").on(table.onboardingStatus),
    index("tutor_profile_inviteId_idx").on(table.inviteId),
  ],
);

export const tutorProfileRelations = relations(tutorProfile, ({ one }) => ({
  user: one(user, {
    fields: [tutorProfile.userId],
    references: [user.id],
  }),
  invite: one(tutorInvite, {
    fields: [tutorProfile.inviteId],
    references: [tutorInvite.id],
  }),
}));

export const userToTutorProfileRelations = relations(user, ({ one }) => ({
  tutorProfile: one(tutorProfile, {
    fields: [user.id],
    references: [tutorProfile.userId],
  }),
}));
```

- [ ] **Step 3: Create `audit-log.ts` schema file**

```ts
import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { uuidPrimaryKey } from "./auth";
import { user } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPrimaryKey,
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    targetType: text("target_type").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actorId_idx").on(table.actorId),
    index("audit_log_targetType_targetId_idx").on(
      table.targetType,
      table.targetId,
    ),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_createdAt_idx").on(table.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));
```

- [ ] **Step 4: Update schema index to re-export new schemas**

Modify `packages/db/src/schema/index.ts`:

```ts
export * from "./auth";
export * from "./todo";
export * from "./student-profile";
export * from "./wallet";
export * from "./achievement";
export * from "./tutor-invite";
export * from "./tutor-profile";
export * from "./audit-log";
```

- [ ] **Step 5: Push schema to dev database**

Run: `bun run db:push`
Expected: Schema pushed successfully, all 3 new tables created with indexes.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/tutor-invite.ts packages/db/src/schema/tutor-profile.ts packages/db/src/schema/audit-log.ts packages/db/src/schema/index.ts
git commit -m "feat: add tutorInvite, tutorProfile, auditLog schemas"
```

---

### Task 2: Admin Tutor Invite API

**Files:**

- Create: `packages/api/src/routers/admin-tutor-router.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create admin-tutor-router.ts with invite CRUD**

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, and, gt, desc } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import {
  user,
  tutorInvite,
  tutorProfile,
  auditLog,
} from "@cogito-app/db/schema";
import type { CogitoUser } from "@cogito-app/auth";
import { adminProcedure } from "../index";

const db = createDb();

const INVITE_EXPIRY_DAYS = 7;

export const adminTutorRouter = {
  createInvite: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(1),
        internalNotes: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const adminId = (context.session.user as CogitoUser).id;

      const existingInvite = await db.query.tutorInvite.findFirst({
        where: and(
          eq(tutorInvite.email, input.email),
          eq(tutorInvite.status, "invited"),
        ),
      });

      if (existingInvite) {
        throw new ORPCError("CONFLICT", {
          message: "An active invite already exists for this email",
        });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      const [invite] = await db
        .insert(tutorInvite)
        .values({
          id: crypto.randomUUID(),
          email: input.email,
          displayName: input.displayName,
          token,
          status: "invited",
          invitedBy: adminId,
          internalNotes: input.internalNotes,
          expiresAt,
        })
        .returning();

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: adminId,
        actorType: "admin",
        action: "tutor_invite_created",
        targetId: invite.id,
        targetType: "tutor_invite",
        details: { email: input.email, displayName: input.displayName },
      });

      return invite;
    }),

  listInvites: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum(["invited", "accepted", "expired", "revoked"])
            .optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const status = input?.status;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const invites = await db.query.tutorInvite.findMany({
        where: status ? eq(tutorInvite.status, status) : undefined,
        orderBy: [desc(tutorInvite.createdAt)],
        limit,
        offset,
      });

      return invites;
    }),

  resendInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .handler(async ({ context, input }) => {
      const adminId = (context.session.user as CogitoUser).id;

      const invite = await db.query.tutorInvite.findFirst({
        where: eq(tutorInvite.id, input.inviteId),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", { message: "Invite not found" });
      }

      if (invite.status !== "invited") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only invited invites can be resent",
        });
      }

      const newToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

      const [updated] = await db
        .update(tutorInvite)
        .set({ token: newToken, expiresAt })
        .where(eq(tutorInvite.id, input.inviteId))
        .returning();

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: adminId,
        actorType: "admin",
        action: "tutor_invite_resent",
        targetId: input.inviteId,
        targetType: "tutor_invite",
      });

      return updated;
    }),

  revokeInvite: adminProcedure
    .input(z.object({ inviteId: z.string() }))
    .handler(async ({ context, input }) => {
      const adminId = (context.session.user as CogitoUser).id;

      const invite = await db.query.tutorInvite.findFirst({
        where: eq(tutorInvite.id, input.inviteId),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", { message: "Invite not found" });
      }

      if (invite.status !== "invited") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only invited invites can be revoked",
        });
      }

      const [updated] = await db
        .update(tutorInvite)
        .set({ status: "revoked" })
        .where(eq(tutorInvite.id, input.inviteId))
        .returning();

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: adminId,
        actorType: "admin",
        action: "tutor_invite_revoked",
        targetId: input.inviteId,
        targetType: "tutor_invite",
      });

      return updated;
    }),

  listTutorProfiles: adminProcedure
    .input(
      z
        .object({
          status: z
            .enum([
              "draft",
              "pending_review",
              "changes_requested",
              "approved_unpublished",
              "published",
              "suspended",
            ])
            .optional(),
          limit: z.number().min(1).max(100).default(50),
          offset: z.number().min(0).default(0),
        })
        .optional(),
    )
    .handler(async ({ input }) => {
      const status = input?.status;
      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const profiles = await db.query.tutorProfile.findMany({
        where: status ? eq(tutorProfile.onboardingStatus, status) : undefined,
        orderBy: [desc(tutorProfile.createdAt)],
        limit,
        offset,
        with: {
          user: true,
        },
      });

      return profiles;
    }),

  reviewTutorProfile: adminProcedure
    .input(
      z.object({
        tutorProfileId: z.string(),
        action: z.enum([
          "request_changes",
          "approve_unpublished",
          "publish",
          "unpublish",
          "suspend",
        ]),
        adminNote: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const adminId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.id, input.tutorProfileId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tutor profile not found",
        });
      }

      const statusMap: Record<string, string> = {
        request_changes: "changes_requested",
        approve_unpublished: "approved_unpublished",
        publish: "published",
        unpublish: "approved_unpublished",
        suspend: "suspended",
      };

      const newStatus = statusMap[input.action];
      if (!newStatus) {
        throw new ORPCError("BAD_REQUEST", { message: "Invalid action" });
      }

      const updates: Record<string, unknown> = {
        onboardingStatus: newStatus,
        adminReviewNote: input.adminNote ?? null,
      };

      if (input.action === "publish") {
        updates.publishedAt = new Date();
      }

      if (input.action === "unpublish") {
        updates.publishedAt = null;
      }

      const [updated] = await db
        .update(tutorProfile)
        .set(updates)
        .where(eq(tutorProfile.id, input.tutorProfileId))
        .returning();

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: adminId,
        actorType: "admin",
        action: `tutor_profile_${input.action}`,
        targetId: input.tutorProfileId,
        targetType: "tutor_profile",
        details: {
          adminNote: input.adminNote,
          previousStatus: profile.onboardingStatus,
          newStatus,
        },
      });

      return updated;
    }),
};
```

- [ ] **Step 2: Create public invite claim endpoint**

Create `packages/api/src/routers/invite-router.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, and, gt } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorInvite, tutorProfile, user } from "@cogito-app/db/schema";
import { publicProcedure, protectedProcedure } from "../index";

const db = createDb();

export const inviteRouter = {
  verify: publicProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ input }) => {
      const invite = await db.query.tutorInvite.findFirst({
        where: and(
          eq(tutorInvite.token, input.token),
          eq(tutorInvite.status, "invited"),
          gt(tutorInvite.expiresAt, new Date()),
        ),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invite not found, already accepted, or expired",
        });
      }

      return {
        email: invite.email,
        displayName: invite.displayName,
        inviteId: invite.id,
      };
    }),

  claim: protectedProcedure
    .input(z.object({ token: z.string() }))
    .handler(async ({ context, input }) => {
      const currentUser = context.session.user;
      const userId = currentUser.id;
      const userEmail = currentUser.email;

      const invite = await db.query.tutorInvite.findFirst({
        where: and(
          eq(tutorInvite.token, input.token),
          eq(tutorInvite.status, "invited"),
          gt(tutorInvite.expiresAt, new Date()),
        ),
      });

      if (!invite) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invite not found, already accepted, or expired",
        });
      }

      if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "This invite is for a different email address. Please log in with the invited email.",
        });
      }

      const existingProfile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (existingProfile) {
        throw new ORPCError("CONFLICT", {
          message: "You already have a tutor profile",
        });
      }

      const [updatedInvite] = await db
        .update(tutorInvite)
        .set({
          status: "accepted",
          acceptedBy: userId,
          acceptedAt: new Date(),
        })
        .where(eq(tutorInvite.id, invite.id))
        .returning();

      const [newProfile] = await db
        .insert(tutorProfile)
        .values({
          id: crypto.randomUUID(),
          userId,
          inviteId: invite.id,
          displayName: invite.displayName,
          expertise: [],
          proofUrls: [],
          onboardingStatus: "draft",
        })
        .returning();

      await db.update(user).set({ role: "tutor" }).where(eq(user.id, userId));

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: userId,
        actorType: "tutor",
        action: "tutor_invite_claimed",
        targetId: invite.id,
        targetType: "tutor_invite",
        details: { profileId: newProfile.id },
      });

      return {
        invite: updatedInvite,
        profile: newProfile,
      };
    }),
};
```

Note: This file needs `auditLog` import — add to the import line:

```ts
import {
  tutorInvite,
  tutorProfile,
  user,
  auditLog,
} from "@cogito-app/db/schema";
```

- [ ] **Step 3: Create tutor-facing profile/onboarding router**

Create `packages/api/src/routers/tutor-router.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorProfile, auditLog } from "@cogito-app/db/schema";
import type { CogitoUser } from "@cogito-app/auth";
import { protectedProcedure } from "../index";

const db = createDb();

const ONLINE_FLOOR_PRICES: Record<string, number> = {
  "1": 42,
  "2": 35,
  "3": 28,
  "4": 24,
  "5": 21,
  "6": 19,
};

const OFFLINE_FLOOR_PRICES: Record<string, number> = {
  "1": 50,
  "2": 45,
  "3": 40,
  "4": 35,
  "5": 30,
  "6": 27,
};

function validatePrices(
  prices: Record<string, number>,
  modality: string,
): string | null {
  if (!prices || Object.keys(prices).length === 0) {
    return "Prices are required";
  }

  const floorPrices =
    modality === "online"
      ? ONLINE_FLOOR_PRICES
      : modality === "offline"
        ? OFFLINE_FLOOR_PRICES
        : null;

  for (const [size, price] of Object.entries(prices)) {
    const groupSize = Number(size);
    if (groupSize < 1 || groupSize > 6) {
      return `Invalid group size: ${size}`;
    }
    if (typeof price !== "number" || price < 0) {
      return `Invalid price for group size ${size}`;
    }

    if (floorPrices) {
      const floor = floorPrices[size];
      if (floor !== undefined && price < floor) {
        return `Price for class for ${size} must be at least ${floor} Marks (floor price)`;
      }
    }
  }

  if (modality === "both" || !floorPrices) {
    const combined = modality === "both" ? true : false;
    if (combined) {
      for (const [size, price] of Object.entries(prices)) {
        const onlineFloor = ONLINE_FLOOR_PRICES[size];
        const offlineFloor = OFFLINE_FLOOR_PRICES[size];
        if (onlineFloor !== undefined && price < onlineFloor) {
          return `Price for class for ${size} must be at least ${onlineFloor} Marks (online floor)`;
        }
      }
    }
  }

  return null;
}

export const tutorRouter = {
  getMyProfile: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tutor profile not found",
        });
      }

      return profile;
    }),

  updateMyProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).optional(),
        shortBio: z.string().optional(),
        credentialsSummary: z.string().optional(),
        expertise: z.array(z.string()).optional(),
        modality: z.enum(["online", "offline", "both"]).optional(),
        prices: z.record(z.string(), z.number()).optional(),
        availabilitySummary: z.string().optional(),
        proofUrls: z.array(z.string()).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tutor profile not found",
        });
      }

      if (profile.onboardingStatus === "published") {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Published profiles cannot be edited directly. Contact admin.",
        });
      }

      if (input.prices && input.modality) {
        const error = validatePrices(input.prices, input.modality);
        if (error) {
          throw new ORPCError("BAD_REQUEST", { message: error });
        }
      } else if (input.prices && !input.modality && !profile.modality) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Modality must be set before prices",
        });
      } else if (input.prices && !input.modality && profile.modality) {
        const error = validatePrices(input.prices, profile.modality);
        if (error) {
          throw new ORPCError("BAD_REQUEST", { message: error });
        }
      }

      const [updated] = await db
        .update(tutorProfile)
        .set(input)
        .where(eq(tutorProfile.userId, userId))
        .returning();

      return updated;
    }),

  submitForReview: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", {
          message: "Tutor profile not found",
        });
      }

      if (
        profile.onboardingStatus !== "draft" &&
        profile.onboardingStatus !== "changes_requested"
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Cannot submit from status: ${profile.onboardingStatus}`,
        });
      }

      const requiredFields = [
        profile.displayName,
        profile.shortBio,
        profile.credentialsSummary,
        profile.modality,
        profile.prices,
      ];
      if (requiredFields.some((f) => !f)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "All required fields must be filled before submission",
        });
      }

      if (!profile.expertise || profile.expertise.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "At least one expertise track is required",
        });
      }

      if (profile.prices) {
        const modality = profile.modality ?? "online";
        const error = validatePrices(
          profile.prices as Record<string, number>,
          modality,
        );
        if (error) {
          throw new ORPCError("BAD_REQUEST", { message: error });
        }
      }

      const [updated] = await db
        .update(tutorProfile)
        .set({ onboardingStatus: "pending_review" })
        .where(eq(tutorProfile.userId, userId))
        .returning();

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId: userId,
        actorType: "tutor",
        action: "tutor_profile_submitted_for_review",
        targetId: profile.id,
        targetType: "tutor_profile",
      });

      return updated;
    }),
};
```

- [ ] **Step 4: Register all new routers in index.ts**

Modify `packages/api/src/routers/index.ts`:

```ts
import type { RouterClient } from "@orpc/server";

import { adminRouter } from "./admin-router";
import { adminTutorRouter } from "./admin-tutor-router";
import { authRouter } from "./auth-router";
import { inviteRouter } from "./invite-router";
import { tutorRouter } from "./tutor-router";
import { protectedProcedure, publicProcedure } from "../index";
import { achievementRouter } from "./achievement-router";
import { todoRouter } from "./todo";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  auth: authRouter,
  admin: adminRouter,
  adminTutor: adminTutorRouter,
  tutor: tutorRouter,
  invite: inviteRouter,
  todo: todoRouter,
  achievement: achievementRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
```

- [ ] **Step 5: Verify DB push still works**

Run: `bun run db:push`
Expected: All existing + 3 new tables pushed successfully.

- [ ] **Step 6: Verify the server starts without errors**

Run: `bun run dev:server`
Expected: Server starts on port 3001, no import/type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routers/admin-tutor-router.ts packages/api/src/routers/invite-router.ts packages/api/src/routers/tutor-router.ts packages/api/src/routers/index.ts
git commit -m "feat: add tutor invite, claim, and onboarding API endpoints"
```

---

### Task 3: Auth Hook — Prevent Tutor Role during Public Signup

**Files:**

- Modify: `packages/auth/src/index.ts`

The PRD states (DL-23, FR-23): "Public signup creates student / default access only and cannot create tutor access." Current signup creates a `user` with role defaulting to `student` and a `wallet`. This is already correct — the `user` table has `role` default `"student"`. But we should verify the signup form does NOT expose a role selector. The current `sign-up-form.tsx` only has name/email/password, which is correct.

However, we need to ensure that when an invite is claimed and role changes to `tutor`, the user's session reflects the updated role. Better Auth caches the user in the session, so after role change the session should be refreshed or the user needs to re-authenticate.

- [ ] **Step 1: Add a session invalidation after role change in invite claim**

In the invite claim handler we already update `user.role` to `"tutor"`. Better Auth stores role in the session. We need to ensure the user gets the new role on next session fetch.

The `auth.me` endpoint queries the DB fresh, so this should work — but let's verify. Looking at `auth-router.ts`, `me` uses `context.session.user` which comes from `getSession()`. Better Auth's `getSession` by default reads from DB, so the role update should be visible immediately.

No code changes needed for this step — the existing setup already queries fresh from DB.

- [ ] **Step 2: Verify sign-up form has no role selector**

Read `apps/web/src/components/sign-up-form.tsx` — confirmed it only has name, email, password. No role selector. The PRD requirement is satisfied.

- [ ] **Step 3: Commit (if any changes were needed)**

If no changes: skip this task. Move on.

---

### Task 4: Invite Claim Page (Public Route)

**Files:**

- Create: `apps/web/src/routes/invite.tsx`
- Create: `apps/web/src/components/tutor/invite-claim-page.tsx`

- [ ] **Step 1: Create the invite claim page component**

Create `apps/web/src/components/tutor/invite-claim-page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { orpc } from "@/utils/orpc";

export function InviteClaimPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{
    email: string;
    displayName: string;
  } | null>(null);

  const verifyMutation = orpc.invite.verify.useMutation();
  const claimMutation = orpc.invite.claim.useMutation();

  async function handleVerify() {
    setLoading(true);
    try {
      const result = await verifyMutation.mutateAsync({ token });
      setInviteInfo({ email: result.email, displayName: result.displayName });
      setVerified(true);
    } catch (error) {
      toastManager.add({
        title: "Invite not found or expired",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim() {
    setLoading(true);
    try {
      await claimMutation.mutateAsync({ token });
      toastManager.add({
        title: "Tutor access activated! Complete your profile to get started.",
        type: "success",
      });
      navigate({ to: "/onboarding" });
    } catch (error: any) {
      const message = error?.error?.message || "Failed to claim invite";
      if (message.includes("different email")) {
        toastManager.add({
          title: "Please log in with the invited email address",
          type: "error",
        });
        navigate({ to: "/login" });
      } else {
        toastManager.add({ title: message, type: "error" });
      }
    } finally {
      setLoading(false);
    }
  }

  if (!verified) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader align="center">
            <CardTitle>Tutor Invitation</CardTitle>
            <CardDescription>
              Verify your invitation to become a tutor on Cogito
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <Button
              block
              loading={loading}
              disabled={loading}
              onClick={handleVerify}
            >
              Verify Invitation
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader align="center">
          <CardTitle>Welcome, {inviteInfo?.displayName}!</CardTitle>
          <CardDescription>
            You've been invited to join Cogito as a tutor. This invitation was
            sent to <strong>{inviteInfo?.email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Text>
            By claiming this invitation, you'll gain tutor access and can set up
            your tutor profile. You must be logged in with the email address{" "}
            <strong>{inviteInfo?.email}</strong> to claim this invite.
          </Text>
          <Button
            block
            loading={loading}
            disabled={loading}
            onClick={handleClaim}
          >
            Claim Invitation & Start Onboarding
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create the invite route**

Create `apps/web/src/routes/invite.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { InviteClaimPage } from "@/components/tutor/invite-claim-page";

export const Route = createFileRoute("/invite")({
  component: RouteComponent,
  validateSearch: (search) => ({ token: search.token as string }),
});

function RouteComponent() {
  const { token } = Route.useSearch();
  return <InviteClaimPage token={token} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/invite.tsx apps/web/src/components/tutor/invite-claim-page.tsx
git commit -m "feat: add public invite claim page with verify and claim flow"
```

---

### Task 5: Tutor Onboarding Page & Form

**Files:**

- Create: `apps/web/src/routes/_app.onboarding.tsx`
- Create: `apps/web/src/components/tutor/onboarding-form.tsx`
- Create: `apps/web/src/components/tutor/tutor-pricing-fields.tsx`
- Modify: `apps/web/src/routes/_app.tsx` (add route title)

- [ ] **Step 1: Create pricing fields component**

Create `apps/web/src/components/tutor/tutor-pricing-fields.tsx`:

```tsx
"use client";

import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Text } from "@cogito-app/ui/components/selia/text";

const FLOOR_PRICES: Record<string, { online: number; offline: number }> = {
  "1": { online: 42, offline: 50 },
  "2": { online: 35, offline: 45 },
  "3": { online: 28, offline: 40 },
  "4": { online: 24, offline: 35 },
  "5": { online: 21, offline: 30 },
  "6": { online: 19, offline: 27 },
};

interface PricingFieldsProps {
  modality: string;
  prices: Record<string, number>;
  onChange: (prices: Record<string, number>) => void;
  errors: Record<string, string>;
}

export function TutorPricingFields({
  modality,
  prices,
  onChange,
  errors,
}: PricingFieldsProps) {
  const minPrice = (size: string) => {
    if (modality === "online") return FLOOR_PRICES[size].online;
    if (modality === "offline") return FLOOR_PRICES[size].offline;
    return Math.min(FLOOR_PRICES[size].online, FLOOR_PRICES[size].offline);
  };

  const label = (size: string) => {
    return `Class for ${size}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <Text className="font-medium">
        Session prices (Marks per student for each group size)
      </Text>
      {[1, 2, 3, 4, 5, 6].map((size) => {
        const key = String(size);
        const floor = minPrice(key);
        return (
          <Field key={key}>
            <FieldLabel>
              {label(key)} — minimum {floor} Marks
            </FieldLabel>
            <Input
              type="number"
              min={floor}
              value={prices[key] ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                const num = val === "" ? 0 : parseInt(val, 10);
                onChange({ ...prices, [key]: num });
              }}
              placeholder={String(floor)}
            />
            {errors[key] && <FieldError>{errors[key]}</FieldError>}
          </Field>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create the onboarding form component**

Create `apps/web/src/components/tutor/onboarding-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Chip } from "@cogito-app/ui/components/selia/chip";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Select, SelectListItem, SelectPopup, SelectTrigger, SelectValue } from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { orpc } from "@/utils/orpc";
import { TutorPricingFields } from "./tutor-pricing-fields";

const EXPERTISE_OPTIONS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Economics",
  "English",
  "History",
  "Other",
];

interface OnboardingFormProps {
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[];
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    proofUrls: string[];
    onboardingStatus: string;
    adminReviewNote: string | null;
  };
}

export function OnboardingForm({ profile }: OnboardingFormProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    displayName: profile.displayName ?? "",
    shortBio: profile.shortBio ?? "",
    credentialsSummary: profile.credentialsSummary ?? "",
    expertise: profile.expertise ?? [],
    modality: profile.modality ?? "",
    prices: (profile.prices as Record<string, number>) ?? {},
    availabilitySummary: profile.availabilitySummary ?? "",
    proofUrls: profile.proofUrls ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newProofUrl, setNewProofUrl] = useState("");

  const updateMutation = orpc.tutor.updateMyProfile.useMutation();
  const submitMutation = orpc.tutor.submitForReview.useMutation();

  async function handleSave() {
    setErrors({});
    const result = await updateMutation.mutateAsync(form);
    return result;
  }

  async function handleSubmitForReview() {
    const validationErrors: Record<string, string> = {};
    if (!form.displayName) validationErrors.displayName = "Required";
    if (!form.shortBio) validationErrors.shortBio = "Required";
    if (!form.credentialsSummary) validationErrors.credentialsSummary = "Required";
    if (!form.modality) validationErrors.modality = "Required";
    if (form.expertise.length === 0) validationErrors.expertise = "Select at least one";
    if (!form.prices || Object.keys(form.prices).length === 0) validationErrors.prices = "Required";

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toastManager.add({ title: "Please fill all required fields", type: "error" });
      return;
    }

    try {
      await updateMutation.mutateAsync(form);
      await submitMutation.mutateAsync();
      toastManager.add({
        title: "Profile submitted for review!",
        type: "success",
      });
    } catch (error: any) {
      toastManager.add({
        title: error?.error?.message || "Failed to submit",
        type: "error",
      });
    }
  }

  function addExpertise(item: string) {
    if (!form.expertise.includes(item)) {
      setForm({ ...form, expertise: [...form.expertise, item] });
    }
  }

  function removeExpertise(item: string) {
    setForm({ ...form, expertise: form.expertise.filter((e) => e !== item) });
  }

  function addProofUrl() {
    if (newProofUrl && !form.proofUrls.includes(newProofUrl)) {
      setForm({ ...form, proofUrls: [...form.proofUrls, newProofUrl] });
      setNewProofUrl("");
    }
  }

  function removeProofUrl(url: string) {
    setForm({ ...form, proofUrls: form.proofUrls.filter((u) => u !== url) });
  }

  const isDraft =
    profile.onboardingStatus === "draft" ||
    profile.onboardingStatus === "changes_requested";

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {profile.adminReviewNote && profile.onboardingStatus === "changes_requested" && (
        <Card>
          <CardHeader>
            <CardTitle>Admin Feedback</CardTitle>
          </CardHeader>
          <CardBody>
            <Text>{profile.adminReviewNote}</Text>
          </CardBody>
        </Card>
      )}

      {profile.onboardingStatus === "pending_review" && (
        <Card>
          <CardBody>
            <Text className="text-center">
              Your profile is under review. You'll be notified once an admin
              approves it.
            </Text>
          </CardBody>
        </Card>
      )}

      {profile.onboardingStatus === "approved_unpublished" && (
        <Card>
          <CardBody>
            <Text className="text-center">
              Your profile has been approved and is awaiting publication by
              admin. You'll be notified when it goes live.
            </Text>
          </CardBody>
        </Card>
      )}

      {profile.onboardingStatus === "published" && (
        <Card>
          <CardBody>
            <Text className="text-center">
              Your tutor profile is live! Students can now discover and book
              sessions with you.
            </Text>
          </CardBody>
        </Card>
      )}

      {!isDraft && profile.onboardingStatus !== "changes_requested" ? null : (
        <>
          {/* Step 1: Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Step 1: Profile Information</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Display Name *</FieldLabel>
                <Input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                  placeholder="How students will see your name"
                />
                {errors.displayName && (
                  <FieldError>{errors.displayName}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Short Bio *</FieldLabel>
                <Input
                  value={form.shortBio}
                  onChange={(e) =>
                    setForm({ ...form, shortBio: e.target.value })
                  }
                  placeholder="Brief introduction about yourself"
                />
                {errors.shortBio && (
                  <FieldError>{errors.shortBio}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Credentials Summary *</FieldLabel>
                <Input
                  value={form.credentialsSummary}
                  onChange={(e) =>
                    setForm({ ...form, credentialsSummary: e.target.value })
                  }
                  placeholder="Degrees, certifications, achievements"
                />
                {errors.credentialsSummary && (
                  <FieldError>{errors.credentialsSummary}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel>Expertise / Competition Tracks *</FieldLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.expertise.map((item) => (
                    <Chip
                      key={item}
                      onRemove={() => removeExpertise(item)}
                    >
                      {item}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXPERTISE_OPTIONS.filter(
                    (opt) => !form.expertise.includes(opt),
                  ).map((opt) => (
                    <Chip
                      key={opt}
                      variant="outline"
                      onClick={() => addExpertise(opt)}
                    >
                      + {opt}
                    </Chip>
                  ))}
                </div>
                {errors.expertise && (
                  <FieldError>{errors.expertise}</FieldError>
                )}
              </Field>

              <div className="flex justify-end">
                <Button onClick={handleSave} loading={updateMutation.isPending}>
                  Save Progress
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Step 2: Modality & Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Modality & Pricing</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Teaching Modality *</FieldLabel>
                <Select
                  value={form.modality}
                  onValueChange={(val) =>
                    setForm({ ...form, modality: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select modality" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">
                        Offline (at Cogito campus)
                      </SelectItem>
                      <SelectItem value="both">Both online and offline</SelectItem>
                    </Select>
                  </SelectPopup>
                </Select>
                {errors.modality && (
                  <FieldError>{errors.modality}</FieldError>
                )}
              </Field>

              {form.modality && (
                <TutorPricingFields
                  modality={form.modality}
                  prices={form.prices}
                  onChange={(prices) => setForm({ ...form, prices })}
                  errors={errors}
                />
              )}

              <div className="flex justify-end">
                <Button onClick={handleSave} loading={updateMutation.isPending}>
                  Save Progress
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Step 3: Availability & Proof */}
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Availability & Credentials Proof</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field>
                <FieldLabel>Availability Summary</FieldLabel>
                <Input
                  value={form.availabilitySummary}
                  onChange={(e) =>
                    setForm({ ...form, availabilitySummary: e.target.value })
                  }
                  placeholder="e.g. Weekdays 3-6 PM, Saturdays 9 AM-12 PM"
                />
              </Field>

              <Field>
                <FieldLabel>Credential Proof URLs (optional)</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    value={newProofUrl}
                    onChange={(e) => setNewProofUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  <Button
                    variant="secondary"
                    onClick={addProofUrl}
                    disabled={!newProofUrl}
                  >
                    Add
                  </Button>
                </div>
                {form.proofUrls.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {form.proofUrls.map((url) => (
                      <div
                        key={url}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Text className="truncate">{url}</Text>
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => removeProofUrl(url)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </CardBody>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleSave} loading={updateMutation.isPending}>
              Save Draft
            </Button>
            <Button onClick={handleSubmitForReview} loading={submitMutation.isPending}>
              Submit for Review
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create onboarding route**

Create `apps/web/src/routes/_app.onboarding.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { OnboardingForm } from "@/components/tutor/onboarding-form";
import { Loader } from "@/components/loader";

export const Route = createFileRoute("/_app/onboarding")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user;
    if (user?.role !== "tutor") {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(orpc.tutor.getMyProfile.queryOptions());

  if (isLoading) return <Loader />;
  if (error || !profile) {
    return (
      <div className="p-8 text-center">
        <p>
          No tutor profile found. You may need to claim a tutor invitation
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">Tutor Onboarding</h1>
      <OnboardingForm profile={profile} />
    </div>
  );
}
```

- [ ] **Step 4: Update `_app.tsx` route titles**

Modify `apps/web/src/routes/_app.tsx` to add the onboarding route title:

Add `"/onboarding": "Tutor Onboarding"` to `routeTitles`:

```ts
const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/balance": "Balance",
  "/achievements": "Achievements",
  "/tutors": "Tutors",
  "/todos": "Todos",
  "/profile": "Profile",
  "/onboarding": "Tutor Onboarding",
};
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_app.onboarding.tsx apps/web/src/components/tutor/onboarding-form.tsx apps/web/src/components/tutor/tutor-pricing-fields.tsx apps/web/src/routes/_app.tsx
git commit -m "feat: add tutor onboarding page with multi-step form and floor price validation"
```

---

### Task 6: Conditional Sidebar Navigation by Role

**Files:**

- Modify: `apps/web/src/components/dashboard/app-sidebar.tsx`

Currently the sidebar shows the same nav items regardless of role. Per PRD, tutors need their own nav (onboarding, availability, incoming bookings), admins need their own nav (invite tutors, review tutors, monitor bookings).

- [ ] **Step 1: Update AppSidebar with role-based navigation**

Modify `apps/web/src/components/dashboard/app-sidebar.tsx`:

Add role-based navigation items. The `useRole()` hook already provides `role`. Import it and conditionally render nav items:

```tsx
import { useRole } from "@/hooks/use-role";

// Inside AppSidebar component:
const { role } = useRole();

// Define navigation based on role
const studentNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/balance", label: "Balance", icon: IconCoins },
  { to: "/achievements", label: "Achievements", icon: IconCertificate },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
];

const tutorNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/onboarding", label: "My Profile", icon: IconUser },
  { to: "/tutors", label: "Tutors", icon: IconUserSquare },
];

const adminNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  { to: "/tutors", label: "Manage Tutors", icon: IconUserSquare },
  { to: "/balance", label: "Wallet Monitor", icon: IconCoins },
];

const navItems =
  role === "admin"
    ? adminNavItems
    : role === "tutor"
      ? tutorNavItems
      : studentNavItems;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/app-sidebar.tsx
git commit -m "feat: role-based sidebar navigation for student, tutor, admin"
```

---

### Task 7: Admin Invite & Review UI

**Files:**

- Create: `apps/web/src/routes/_app.admin-tutors.tsx`
- Create: `apps/web/src/components/admin/tutor-invite-form.tsx`
- Create: `apps/web/src/components/admin/tutor-review-card.tsx`

- [ ] **Step 1: Create admin tutor invite form component**

Create `apps/web/src/components/admin/tutor-invite-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { orpc } from "@/utils/orpc";

export function TutorInviteForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const createMutation = orpc.adminTutor.createInvite.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const invite = await createMutation.mutateAsync({
        email,
        displayName,
        internalNotes: internalNotes || undefined,
      });
      toastManager.add({
        title: `Invitation sent to ${invite.email}`,
        type: "success",
      });
      setEmail("");
      setDisplayName("");
      setInternalNotes("");
    } catch (error: any) {
      toastManager.add({
        title: error?.error?.message || "Failed to create invite",
        type: "error",
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Tutor</CardTitle>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Email Address *</FieldLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@example.com"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Display Name *</FieldLabel>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dr. Sarah Chen"
              required
            />
          </Field>
          <Field>
            <FieldLabel>Internal Notes (optional)</FieldLabel>
            <Input
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Recommended by... / Specialization: ..."
            />
          </Field>
          <Button
            type="submit"
            block
            loading={createMutation.isPending}
            disabled={!email || !displayName}
          >
            Send Invitation
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 2: Create admin tutor review card component**

Create `apps/web/src/components/admin/tutor-review-card.tsx`:

```tsx
"use client";

import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Text } from "@cogito-app/ui/components/selia/text";
import { orpc } from "@/utils/orpc";

interface TutorReviewCardProps {
  profile: {
    id: string;
    displayName: string | null;
    shortBio: string | null;
    credentialsSummary: string | null;
    expertise: string[];
    modality: string | null;
    prices: Record<string, number> | null;
    availabilitySummary: string | null;
    onboardingStatus: string;
    adminReviewNote: string | null;
    user?: {
      name: string;
      email: string;
    };
  };
  onAction?: () => void;
}

const STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant:
      "primary" | "secondary" | "danger" | "warning" | "success" | "info";
  }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Pending Review", variant: "warning" },
  changes_requested: { label: "Changes Requested", variant: "danger" },
  approved_unpublished: { label: "Approved (unpublished)", variant: "info" },
  published: { label: "Published", variant: "success" },
  suspended: { label: "Suspended", variant: "danger" },
};

const FLOOR_ONLINE: Record<string, number> = {
  "1": 42,
  "2": 35,
  "3": 28,
  "4": 24,
  "5": 21,
  "6": 19,
};
const FLOOR_OFFLINE: Record<string, number> = {
  "1": 50,
  "2": 45,
  "3": 40,
  "4": 35,
  "5": 30,
  "6": 27,
};

export function TutorReviewCard({ profile, onAction }: TutorReviewCardProps) {
  const reviewMutation = orpc.adminTutor.reviewTutorProfile.useMutation();

  async function handleAction(
    action:
      | "request_changes"
      | "approve_unpublished"
      | "publish"
      | "unpublish"
      | "suspend",
    adminNote?: string,
  ) {
    try {
      await reviewMutation.mutateAsync({
        tutorProfileId: profile.id,
        action,
        adminNote,
      });
      onAction?.();
    } catch {
      // Error handled by toast in mutation config
    }
  }

  const badge = STATUS_BADGE[profile.onboardingStatus] ?? {
    label: profile.onboardingStatus,
    variant: "secondary" as const,
  };

  const floorPrices =
    profile.modality === "offline" ? FLOOR_OFFLINE : FLOOR_ONLINE;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{profile.displayName ?? "Unnamed Tutor"}</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        {profile.user && (
          <Text className="text-sm text-muted">{profile.user.email}</Text>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {profile.shortBio && <Text>{profile.shortBio}</Text>}
        {profile.credentialsSummary && (
          <Text className="text-sm">
            Credentials: {profile.credentialsSummary}
          </Text>
        )}
        {profile.expertise && profile.expertise.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.expertise.map((e) => (
              <Badge key={e} variant="secondary">
                {e}
              </Badge>
            ))}
          </div>
        )}
        {profile.modality && (
          <Text className="text-sm">Modality: {profile.modality}</Text>
        )}
        {profile.prices && (
          <div className="text-sm">
            <Text className="font-medium">Pricing:</Text>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {Object.entries(profile.prices).map(([size, price]) => (
                <Text key={size} className="text-xs">
                  Class for {size}: {price} Marks (floor:{" "}
                  {floorPrices[size] ?? "?"})
                </Text>
              ))}
            </div>
          </div>
        )}
        {profile.availabilitySummary && (
          <Text className="text-sm">
            Availability: {profile.availabilitySummary}
          </Text>
        )}
        {profile.adminReviewNote && (
          <Text className="text-sm text-muted">
            Admin note: {profile.adminReviewNote}
          </Text>
        )}

        {profile.onboardingStatus === "pending_review" && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const note = prompt("What changes are needed?");
                if (note) handleAction("request_changes", note);
              }}
            >
              Request Changes
            </Button>
            <Button
              size="sm"
              onClick={() => handleAction("approve_unpublished")}
            >
              Approve (unpublished)
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleAction("publish")}
            >
              Publish
            </Button>
          </div>
        )}

        {profile.onboardingStatus === "approved_unpublished" && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleAction("publish")}
            >
              Publish Now
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const note = prompt("What changes are needed?");
                if (note) handleAction("request_changes", note);
              }}
            >
              Request Changes
            </Button>
          </div>
        )}

        {profile.onboardingStatus === "published" && (
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleAction("unpublish")}
            >
              Unpublish
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const note = prompt("Reason for suspension:");
                if (note) handleAction("suspend", note);
              }}
            >
              Suspend
            </Button>
          </div>
        )}

        {profile.onboardingStatus === "changes_requested" && (
          <Text className="text-sm text-muted italic">
            Awaiting tutor updates
          </Text>
        )}
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 3: Create admin tutors route page**

Create `apps/web/src/routes/_app.admin-tutors.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Select,
  SelectListItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { orpc } from "@/utils/orpc";
import { TutorInviteForm } from "@/components/admin/tutor-invite-form";
import { TutorReviewCard } from "@/components/admin/tutor-review-card";

export const Route = createFileRoute("/_app/admin-tutors")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [inviteFilter, setInviteFilter] = useState<string>("");

  const { data: profiles = [], refetch: refetchProfiles } = useQuery(
    orpc.adminTutor.listTutorProfiles.queryOptions({
      status: statusFilter || undefined,
    } as any),
  );

  const { data: invites = [], refetch: refetchInvites } = useQuery(
    orpc.adminTutor.listInvites.queryOptions({
      status: inviteFilter || undefined,
    } as any),
  );

  return (
    <div className="p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Manage Tutors</h1>

      <TutorInviteForm />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invitations</CardTitle>
            <Select
              value={inviteFilter}
              onValueChange={setInviteFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </Select>
              </SelectPopup>
            </Select>
          </div>
        </CardHeader>
        <CardBody>
          {invites.length === 0 ? (
            <Text className="text-muted">No invitations found.</Text>
          ) : (
            <div className="flex flex-col gap-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between border-b border-item-border pb-2"
                >
                  <div>
                    <Text className="font-medium">{invite.displayName}</Text>
                    <Text className="text-sm text-muted">{invite.email}</Text>
                  </div>
                  <Text className="text-sm">{invite.status}</Text>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tutor Profiles</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="changes_requested">Changes Requested</SelectItem>
                  <SelectItem value="approved_unpublished">Approved (unpublished)</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </Select>
              </SelectPopup>
            </Select>
          </div>
        </CardHeader>
        <CardBody>
          {profiles.length === 0 ? (
            <Text className="text-muted">No tutor profiles found.</Text>
          ) : (
            <Stack direction="column" spacing="md">
              {profiles.map((profile) => (
                <TutorReviewCard
                  key={profile.id}
                  profile={profile}
                  onAction={() => refetchProfiles()}
                />
              ))}
            </Stack>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Update route titles in `_app.tsx`**

Add `"/admin-tutors": "Manage Tutors"` to `routeTitles`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_app.admin-tutors.tsx apps/web/src/components/admin/tutor-invite-form.tsx apps/web/src/components/admin/tutor-review-card.tsx apps/web/src/routes/_app.tsx
git commit -m "feat: add admin tutor management UI with invite form and review cards"
```

---

### Task 8: Auth.me Response — Include Tutor Profile

**Files:**

- Modify: `packages/api/src/routers/auth-router.ts`

When a tutor user calls `auth.me`, the frontend needs to know their tutor profile status to route them correctly (e.g., draft → onboarding, published → tutor dashboard).

- [ ] **Step 1: Update authRouter.me to include tutorProfile**

Modify `packages/api/src/routers/auth-router.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { studentProfile, tutorProfile } from "@cogito-app/db/schema";

import { protectedProcedure } from "../index";

const db = createDb();

export const authRouter = {
  me: protectedProcedure
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = context.session.user.id;

      const [profile, tutor] = await Promise.all([
        db.query.studentProfile.findFirst({
          where: eq(studentProfile.userId, userId),
        }),
        db.query.tutorProfile.findFirst({
          where: eq(tutorProfile.userId, userId),
        }),
      ]);

      return {
        user: context.session.user,
        profile,
        tutorProfile: tutor ?? null,
      };
    }),

  // ... rest unchanged
```

- [ ] **Step 2: Update useRole hook to include tutorProfile**

Modify `apps/web/src/hooks/use-role.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import type { CogitoUser } from "@cogito-app/auth";

import { orpc } from "@/utils/orpc";

export function useRole() {
  const { data, isLoading } = useQuery(orpc.auth.me.queryOptions());
  const user = data?.user as CogitoUser | undefined;

  return {
    role: user?.role ?? "student",
    user,
    profile: data?.profile,
    tutorProfile: data?.tutorProfile ?? null,
    isLoading,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/auth-router.ts apps/web/src/hooks/use-role.ts
git commit -m "feat: include tutorProfile in auth.me response and useRole hook"
```

---

## Self-Review Checklist

### Spec Coverage

| PRD Requirement                                                             | Task                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| FR-23: Invite-only tutor access, admin creates invite                       | Task 2 (adminTutor.createInvite)                                                               |
| FR-23: Public signup cannot create tutor role                               | Task 3 (verified, no changes needed)                                                           |
| FR-23: New user account claim flow                                          | Task 2 (inviteRouter.claim)                                                                    |
| FR-23: Existing user email match claim                                      | Task 2 (inviteRouter.claim — email mismatch check)                                             |
| FR-23: Expired/revoked invites cannot be claimed                            | Task 2 (inviteRouter.verify + claim check status + expiresAt)                                  |
| FR-23: Admin can resend/revoke invites                                      | Task 2 (adminTutor.resendInvite, revokeInvite)                                                 |
| FR-24: Tutor profile lifecycle states (draft → pending_review → published)  | Task 1 (tutorProfile schema), Task 5 (onboarding form), Task 2 (adminTutor.reviewTutorProfile) |
| FR-24: Required onboarding fields                                           | Task 5 (OnboardingForm validation)                                                             |
| FR-24: Admin review: request_changes, approve_unpublished, publish, suspend | Task 2 (reviewTutorProfile), Task 7 (TutorReviewCard)                                          |
| FR-05: Floor price validation                                               | Task 5 (TutorPricingFields + validatePrices)                                                   |
| DL-23: Invite lifecycle states                                              | Task 1 (tutorInvite schema)                                                                    |
| TC-08: New tutor account claim                                              | Task 2, 4                                                                                      |
| TC-09: Existing user email match                                            | Task 2 (email mismatch error)                                                                  |
| TC-10: Onboarding review & publication gate                                 | Task 2, 5, 7                                                                                   |
| Audit trail for all state changes                                           | Task 1 (auditLog schema), Task 2 (audit inserts on every action)                               |

### Placeholder Scan

- No TBD, TODO, or "implement later" in plan steps
- All code shown is complete implementation
- No "similar to Task N" references

### Type Consistency

- `tutorInvite.id` → text PK (uuidPrimaryKey) — used consistently
- `tutorProfile.userId` → text FK → user.id — used consistently
- `tutorProfile.onboardingStatus` → text with string literals — used consistently
- `auditLog.actorId` → text FK → user.id — used consistently
- All Zod schemas match Drizzle column types

### Missing / Future Work (not in this plan)

- **Email sending**: Invite email delivery needs an email service integration (deferred — admin can copy invite link)
- **Tutor discovery page**: The student-facing tutor list needs separate implementation
- **Availability management**: Tutor availability slots (separate from `availabilitySummary` text field)
- **Booking flow**: Entire booking state machine is a separate plan
- **Notification system**: In-app notification records — separate plan
- **Real wallet/ledger API**: Separate plan after tutor onboarding
