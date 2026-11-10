import { z } from "zod";

export const STUDENT_TERMS_VERSION = "2026-11";
export const studentTermsConsentSchema = z.discriminatedUnion("ageGroup", [
  z.object({
    termsAccepted: z.literal(true),
    termsVersion: z.literal(STUDENT_TERMS_VERSION),
    ageGroup: z.literal("adult"),
  }),
  z.object({
    termsAccepted: z.literal(true),
    termsVersion: z.literal(STUDENT_TERMS_VERSION),
    ageGroup: z.literal("minor"),
    guardianName: z.string().trim().min(1).max(200),
    guardianRelationship: z.enum(["father", "mother", "guardian"]),
    guardianAccepted: z.literal(true),
  }),
]);
export type StudentTermsConsent = z.infer<typeof studentTermsConsentSchema>;

export function studentTermsAcceptanceValues(
  userId: string,
  consent: StudentTermsConsent,
) {
  return {
    userId,
    version: STUDENT_TERMS_VERSION,
    ageGroup: consent.ageGroup,
    guardianName: consent.ageGroup === "minor" ? consent.guardianName : null,
    guardianRelationship:
      consent.ageGroup === "minor" ? consent.guardianRelationship : null,
  };
}
