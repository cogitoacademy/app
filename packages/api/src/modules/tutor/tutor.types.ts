import { z } from "zod";
import { MAX_TUTOR_SUBJECTS } from "../tutor-subjects/subject-selection";
import { externalHttpUrl } from "../../lib/url-schema";

export const updateMyProfileInput = z.object({
  version: z.number().int(),
  displayName: z.string().min(1).max(255).optional(),
  shortBio: z.string().max(2000).optional(),
  achievements: z.string().max(5000).optional(),
  experiences: z.string().max(5000).optional(),
  achievementProofUrls: z.array(externalHttpUrl).max(20).optional(),
  experienceProofUrls: z.array(externalHttpUrl).max(20).optional(),
  sourcePhotoUrl: externalHttpUrl.optional(),
  expertise: z.array(z.string().max(255)).max(20).optional(),
  subjectIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(MAX_TUTOR_SUBJECTS)
    .refine((subjectIds) => new Set(subjectIds).size === subjectIds.length, {
      message: "subjectIds must not contain duplicates",
    })
    .optional(),
  modality: z.enum(["online", "offline", "both"]).optional(),
  baseRatesIdr: z
    .record(z.string(), z.number().int())
    .refine(
      (record) =>
        Object.keys(record).length <= 2 &&
        Object.keys(record).every(
          (key) => key === "online" || key === "offline",
        ),
      { message: "baseRatesIdr must only contain online/offline keys" },
    )
    .optional(),
  bankName: z.string().trim().min(2).max(100).optional(),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/, "Bank account number must contain 6-30 digits")
    .optional(),
  bankAccountHolderName: z.string().trim().min(2).max(100).optional(),
  bankAccountOpeningCity: z.string().trim().min(2).max(100).optional(),
  bankAccountOwnership: z.enum(["self", "trusted_person"]).optional(),
  bankTransferDisclaimerAccepted: z.boolean().optional(),
  prices: z
    .record(z.string(), z.number())
    .refine(
      (record) => {
        const keys = Object.keys(record);
        return keys.length <= 6 && keys.every((k) => /^[1-6]$/.test(k));
      },
      { message: "prices must be keyed by group size 1-6" },
    )
    .optional(),
});

export const getMyPayoutsInput = z.object({
  dateFrom: z.string().max(100).optional(),
  dateTo: z.string().max(100).optional(),
});
