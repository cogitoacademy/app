import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorInvite, tutorProfile, auditLog } from "@cogito-app/db/schema";
import type { CogitoUser } from "@cogito-app/auth";
import { adminProcedure } from "../index";

const db = createDb();

const INVITE_EXPIRY_DAYS = 7;

export const adminTutorRouter = {
  createInvite: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/create",
      tags: ["Admin Tutors"],
      summary: "Create tutor invite",
      description: "Creates a tutor invite by email",
    })
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
        targetId: invite!.id,
        targetType: "tutor_invite",
        details: { email: input.email, displayName: input.displayName },
      });

      return invite;
    }),

  listInvites: adminProcedure
    .route({
      method: "POST",
      path: "/admin/tutors/invites/list",
      tags: ["Admin Tutors"],
      summary: "List tutor invites",
      description: "Returns tutor invites, optionally filtered by status",
    })
    .input(
      z.object({
        status: z.enum(["invited", "accepted", "expired", "revoked"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
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
    .route({
      method: "POST",
      path: "/admin/tutors/invites/resend",
      tags: ["Admin Tutors"],
      summary: "Resend tutor invite",
      description: "Regenerates an invite token and expiry",
    })
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
    .route({
      method: "POST",
      path: "/admin/tutors/invites/revoke",
      tags: ["Admin Tutors"],
      summary: "Revoke tutor invite",
      description: "Revokes a pending tutor invite",
    })
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
    .route({
      method: "POST",
      path: "/admin/tutors/profiles/list",
      tags: ["Admin Tutors"],
      summary: "List tutor profiles",
      description: "Returns tutor profiles, optionally filtered by onboarding status",
    })
    .input(
      z.object({
        status: z.enum([
          "draft",
          "pending_review",
          "changes_requested",
          "approved_unpublished",
          "published",
          "suspended",
        ]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional(),
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
    .route({
      method: "POST",
      path: "/admin/tutors/profiles/review",
      tags: ["Admin Tutors"],
      summary: "Review tutor profile",
      description: "Reviews or changes a tutor profile status",
    })
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
        throw new ORPCError("NOT_FOUND", { message: "Tutor profile not found" });
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

      if (input.action === "unpublish" || input.action === "suspend") {
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
        details: { adminNote: input.adminNote, previousStatus: profile.onboardingStatus, newStatus },
      });

      return updated;
    }),
};
