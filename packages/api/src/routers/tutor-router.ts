import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorProfile, auditLog } from "@cogito-app/db/schema";
import type { CogitoUser } from "@cogito-app/auth";
import { protectedProcedure } from "../index";

const db = createDb();

const ONLINE_FLOOR_PRICES: Record<string, number> = {
  "1": 42, "2": 35, "3": 28, "4": 24, "5": 21, "6": 19,
};

const OFFLINE_FLOOR_PRICES: Record<string, number> = {
  "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 27,
};

function validatePrices(prices: Record<string, number>, modality: string): string | null {
  if (!prices || Object.keys(prices).length === 0) {
    return "Prices are required";
  }

  let floorPrices: Record<string, number> | null = null;

  if (modality === "online") {
    floorPrices = ONLINE_FLOOR_PRICES;
  } else if (modality === "offline") {
    floorPrices = OFFLINE_FLOOR_PRICES;
  } else if (modality === "both") {
    floorPrices = ONLINE_FLOOR_PRICES;
  }

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

  return null;
}

export const tutorRouter = {
  getMyProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/get",
      tags: ["Tutor"],
      summary: "Get tutor profile",
      description: "Returns the authenticated tutor's profile",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", { message: "Tutor profile not found" });
      }

      return profile;
    }),

  updateMyProfile: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/profile/update",
      tags: ["Tutor"],
      summary: "Update tutor profile",
      description: "Updates the authenticated tutor's draft profile",
    })
    .input(
      z.object({
        displayName: z.string().min(1).optional(),
        shortBio: z.string().optional(),
        credentialsSummary: z.string().optional(),
        expertise: z.array(z.string()).optional(),
        modality: z.enum(["online", "offline", "both"]).optional(),
        prices: z.record(z.string(), z.number()).optional(),
        availabilitySummary: z.string().optional(),
        proofUrls: z.array(z.string().url()).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", { message: "Tutor profile not found" });
      }

      if (profile.onboardingStatus === "published") {
        throw new ORPCError("FORBIDDEN", {
          message: "Published profiles cannot be edited directly. Contact admin.",
        });
      }

      if (input.prices) {
        const modality = input.modality ?? profile.modality ?? "online";
        const error = validatePrices(input.prices, modality);
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
    .route({
      method: "POST",
      path: "/tutor/profile/submit",
      tags: ["Tutor"],
      summary: "Submit tutor profile",
      description: "Submits a tutor profile for admin review",
    })
    .input(z.void())
    .handler(async ({ context }) => {
      const userId = (context.session.user as CogitoUser).id;

      const profile = await db.query.tutorProfile.findFirst({
        where: eq(tutorProfile.userId, userId),
      });

      if (!profile) {
        throw new ORPCError("NOT_FOUND", { message: "Tutor profile not found" });
      }

      if (profile.onboardingStatus !== "draft" && profile.onboardingStatus !== "changes_requested") {
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
        const error = validatePrices(profile.prices as Record<string, number>, modality);
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
