import { z } from "zod";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

const sessionDraftInput = z.object({
  id: z.string().uuid().optional(),
  capacity: z.number().int().min(1).max(10_000),
  titleEn: z.string().trim().min(1).max(200),
  titleId: nullableText(200),
  curriculumEn: nullableText(5_000),
  curriculumId: nullableText(5_000),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  mode: z.enum(["online", "in_person"]),
  roomId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value || null),
  tutorId: z.string().trim().min(1).max(128),
});

const commonDraftFields = {
  id: z.string().uuid().optional(),
  expectedVersion: z.number().int().positive().optional(),
  competitionId: z.string().trim().min(1).max(128),
  titleEn: z.string().trim().min(1).max(200),
  titleId: nullableText(200),
  descriptionEn: z.string().trim().min(1).max(5_000),
  descriptionId: nullableText(5_000),
  coverKey: nullableText(1_000),
  tutorFeeIdr: z.number().int().min(1).max(2_000_000_000),
  reason: z.string().trim().min(3).max(500),
};

export const saveAcademyClassDraftInput = z
  .discriminatedUnion("kind", [
    z.object({
      ...commonDraftFields,
      kind: z.literal("cohort"),
      minimumEnrollment: z.number().int().min(1).max(10_000),
      minimumCheckAt: z.coerce.date(),
      fullRateMarks: z.number().int().min(1).max(1_000_000),
      halfRateMarks: z.number().int().min(1).max(1_000_000),
      singleRateMarks: z.number().int().min(1).max(1_000_000),
      sessions: z.array(sessionDraftInput).min(1).max(64),
    }),
    z.object({
      ...commonDraftFields,
      kind: z.literal("masterclass"),
      masterclassRateMarks: z.number().int().min(1).max(1_000_000),
      sessions: z.array(sessionDraftInput).length(1),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.id && value.expectedVersion === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Expected version is required when updating a class draft",
      });
    }
    if (!value.id && value.expectedVersion !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Expected version is only valid when updating a class draft",
      });
    }
    value.sessions.forEach((session, index) => {
      if (session.endAt <= session.startAt) {
        ctx.addIssue({
          code: "custom",
          path: ["sessions", index, "endAt"],
          message: "Session end time must be after its start time",
        });
      }
      if (session.mode === "online" && session.roomId) {
        ctx.addIssue({
          code: "custom",
          path: ["sessions", index, "roomId"],
          message: "Online sessions cannot be assigned an in-person room",
        });
      }
      if (session.mode === "in_person" && !session.roomId) {
        ctx.addIssue({
          code: "custom",
          path: ["sessions", index, "roomId"],
          message: "In-person sessions must select an active room",
        });
      }
    });
  });

export const listAcademyClassesInput = z.object({
  state: z
    .enum(["draft", "published", "postponed", "cancelled", "completed"])
    .optional(),
});

export const getAcademyClassInput = z.object({
  id: z.string().uuid(),
});

export const publishAcademyClassInput = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export const retryAcademyClassMeetingsInput = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const reportTutorAbsenceInput = z.object({
  sessionId: z.string().uuid(),
  requestKey: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export const replaceAbsentClassTutorInput = z.object({
  sessionId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  replacementTutorId: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(3).max(500),
});

export const rescheduleAcademyClassSessionInput = z
  .object({
    sessionId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.endAt <= value.startAt)
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Session end time must be after its start time",
      });
  });
