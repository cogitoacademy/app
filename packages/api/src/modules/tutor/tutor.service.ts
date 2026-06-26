import { eq, and, gte, lte, ne } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { PricingPort } from "../../shared/ports/pricing.port";
import { notFound, forbidden, badRequest, conflict } from "../../lib/errors";

export interface UpdateMyProfileInput {
  displayName?: string;
  shortBio?: string;
  credentialsSummary?: string;
  expertise?: string[];
  modality?: "online" | "offline" | "both";
  prices?: Record<string, number>;
  availabilitySummary?: string;
  proofUrls?: string[];
}

export interface UpsertAvailabilityInput {
  id?: string;
  startDate: string;
  endDate: string;
  modality: "online" | "offline" | "both";
  isRecurring?: boolean;
  recurrenceRule?: string;
  isActive?: boolean;
}

export type TutorService = ReturnType<typeof createTutorService>;

export function createTutorService(deps: {
  db: DbType;
  pricing: PricingPort;
  audit: AuditPort;
}) {
  const { db, pricing, audit } = deps;

  async function getMyProfile(userId: string) {
    const profile = await db.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });
    if (!profile) throw notFound("Tutor profile not found");
    return profile;
  }

  async function updateMyProfile(userId: string, input: UpdateMyProfileInput) {
    const profile = await db.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });
    if (!profile) throw notFound("Tutor profile not found");
    if (profile.onboardingStatus === "published") {
      throw forbidden(
        "Published profiles cannot be edited directly. Contact admin.",
      );
    }

    if (input.prices) {
      const modality = (input.modality ?? profile.modality ?? "online") as
        | "online"
        | "offline"
        | "both";
      const error = pricing.validatePrices(input.prices, modality);
      if (error) throw badRequest(error);
    }

    const [updated] = await db
      .update(tutorProfile)
      .set(input)
      .where(eq(tutorProfile.userId, userId))
      .returning();

    return updated;
  }

  async function submitForReview(userId: string) {
    const profile = await db.query.tutorProfile.findFirst({
      where: eq(tutorProfile.userId, userId),
    });
    if (!profile) throw notFound("Tutor profile not found");

    if (
      profile.onboardingStatus !== "draft" &&
      profile.onboardingStatus !== "changes_requested"
    ) {
      throw badRequest(
        `Cannot submit from status: ${profile.onboardingStatus}`,
      );
    }

    const requiredFields = [
      profile.displayName,
      profile.shortBio,
      profile.credentialsSummary,
      profile.modality,
      profile.prices,
    ];
    if (requiredFields.some((f) => !f)) {
      throw badRequest("All required fields must be filled before submission");
    }

    if (!profile.expertise || profile.expertise.length === 0) {
      throw badRequest("At least one expertise track is required");
    }

    if (profile.prices) {
      const modality = (profile.modality ?? "online") as
        | "online"
        | "offline"
        | "both";
      const error = pricing.validatePrices(
        profile.prices as Record<string, number>,
        modality,
      );
      if (error) throw badRequest(error);
    }

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(tutorProfile)
        .set({ onboardingStatus: "pending_review" })
        .where(eq(tutorProfile.userId, userId))
        .returning();

      await audit.record({
        db: tx,
        actorId: userId,
        actorType: "tutor",
        action: "tutor_profile_submitted_for_review",
        targetId: profile.id,
        targetType: "tutor_profile",
        beforeState: { onboardingStatus: profile.onboardingStatus },
        afterState: { onboardingStatus: "pending_review" },
      });

      return row;
    });
  }

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

    const overlapConditions = [
      eq(availabilitySlot.tutorId, userId),
      eq(availabilitySlot.isActive, true),
      lte(availabilitySlot.startDate, end),
      gte(availabilitySlot.endDate, start),
    ];
    if (input.id) {
      overlapConditions.push(ne(availabilitySlot.id, input.id));
    }

    const existing = await db
      .select()
      .from(availabilitySlot)
      .where(and(...overlapConditions))
      .limit(1);

    if (existing.length > 0) {
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

  return {
    getMyProfile,
    updateMyProfile,
    submitForReview,
    listAvailability,
    upsertAvailability,
    deleteAvailability,
  };
}
