import { eq } from "drizzle-orm";
import { tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { PricingPort } from "../../shared/ports/pricing.port";
import { notFound, forbidden, badRequest } from "../../lib/errors";

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

  return { getMyProfile, updateMyProfile, submitForReview };
}
