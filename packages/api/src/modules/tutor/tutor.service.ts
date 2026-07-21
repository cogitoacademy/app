import type { tutorProfile } from "@cogito-app/db/schema";
import type { ORPCError } from "@orpc/server";
import { notFound, forbidden, badRequest } from "../../lib/errors";
import { ONBOARDING_STATUS, MODALITY } from "../../shared/constants";
import type { PricingPort } from "../../shared/ports/pricing.port";
import type { UpdateProfileInput } from "./tutor.repo";

type TutorProfileRow = typeof tutorProfile.$inferSelect;

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: ORPCError<any, any> };

export function validateUpdateInput(
  profile: TutorProfileRow | undefined,
  input: UpdateProfileInput,
  pricingPort: PricingPort,
): ValidationResult {
  if (!profile) {
    return { ok: false, error: notFound("Tutor profile not found") };
  }

  if (profile.onboardingStatus === ONBOARDING_STATUS.PUBLISHED) {
    return {
      ok: false,
      error: forbidden(
        "Published profiles cannot be edited directly. Contact admin.",
      ),
    };
  }

  if (input.prices) {
    const modality = (input.modality ?? profile.modality ?? MODALITY.ONLINE) as
      | "online"
      | "offline"
      | "both";
    const error = pricingPort.validatePrices(input.prices, modality);
    if (error) {
      return { ok: false, error: badRequest(error) };
    }
  }

  return { ok: true };
}

export function validateSubmitForReview(
  profile: TutorProfileRow | undefined,
  pricingPort: PricingPort,
): ValidationResult {
  if (!profile) {
    return { ok: false, error: notFound("Tutor profile not found") };
  }

  if (
    profile.onboardingStatus !== ONBOARDING_STATUS.DRAFT &&
    profile.onboardingStatus !== ONBOARDING_STATUS.CHANGES_REQUESTED
  ) {
    return {
      ok: false,
      error: badRequest(
        `Cannot submit from status: ${profile.onboardingStatus}`,
      ),
    };
  }

  const requiredFields = [
    profile.displayName,
    profile.shortBio,
    profile.credentialsSummary,
    profile.modality,
    profile.prices,
  ];
  if (requiredFields.some((f) => !f)) {
    return {
      ok: false,
      error: badRequest("All required fields must be filled before submission"),
    };
  }

  if (!profile.expertise || profile.expertise.length === 0) {
    return {
      ok: false,
      error: badRequest("At least one expertise track is required"),
    };
  }

  if (profile.prices) {
    const modality = (profile.modality ?? MODALITY.ONLINE) as
      | "online"
      | "offline"
      | "both";
    const error = pricingPort.validatePrices(
      profile.prices as Record<string, number>,
      modality,
    );
    if (error) {
      return { ok: false, error: badRequest(error) };
    }
  }

  return { ok: true };
}
