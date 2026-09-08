import { z } from "zod";

const MAX_WEEKLY_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

const futureDate = z.coerce
  .date()
  .refine((date) => date > new Date(), "Must be in the future");

export const upsertAvailabilityInput = z
  .object({
    id: z.string().max(100).optional(),
    startDate: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    endDate: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    modality: z.enum(["online", "offline", "both"]),
    isRecurring: z.boolean().optional(),
    recurrenceRule: z.string().max(255).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

const dateOverrideSlotInput = z
  .object({
    startDate: futureDate,
    endDate: futureDate,
    modality: z.enum(["online", "offline", "both"]),
  })
  .refine((slot) => slot.endDate > slot.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const createDateOverridesInput = z
  .object({
    slots: z.array(dateOverrideSlotInput).min(1).max(56),
  })
  .superRefine((input, ctx) => {
    for (let index = 0; index < input.slots.length; index += 1) {
      const slot = input.slots[index]!;
      for (
        let candidateIndex = index + 1;
        candidateIndex < input.slots.length;
        candidateIndex += 1
      ) {
        const candidate = input.slots[candidateIndex]!;
        if (
          slot.startDate < candidate.endDate &&
          slot.endDate > candidate.startDate
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Date override slots must not overlap",
            path: ["slots", candidateIndex, "startDate"],
          });
        }
      }
    }
  });

export const deleteAvailabilityInput = z.object({
  id: z.string().max(100),
});

export const createWeeklyAvailabilityInput = z
  .object({
    startDate: futureDate,
    endDate: futureDate,
    repeatUntil: futureDate,
    modality: z.enum(["online", "offline", "both"]),
  })
  .superRefine((input, ctx) => {
    if (input.endDate <= input.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "endDate must be after startDate",
        path: ["endDate"],
      });
    }

    if (input.repeatUntil < input.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "repeatUntil must be on or after startDate",
        path: ["repeatUntil"],
      });
    }

    if (
      input.endDate.getTime() - input.startDate.getTime() >
      7 * 24 * 60 * 60 * 1000
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A weekly availability window must be shorter than 7 days",
        path: ["endDate"],
      });
    }

    if (
      input.repeatUntil.getTime() - input.startDate.getTime() >
      MAX_WEEKLY_RANGE_MS
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Weekly availability can be scheduled for up to 52 weeks",
        path: ["repeatUntil"],
      });
    }
  });

const weeklyTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const weeklyRangeInput = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: weeklyTime,
    endTime: weeklyTime,
    modality: z.enum(["online", "offline", "both"]),
  })
  .refine((range) => range.endTime > range.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const replaceWeeklyAvailabilityInput = z
  .object({
    effectiveFrom: z.coerce.date(),
    repeatUntil: futureDate,
    ranges: z.array(weeklyRangeInput).max(21),
  })
  .superRefine((input, ctx) => {
    if (input.repeatUntil < input.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        message: "repeatUntil must be on or after effectiveFrom",
        path: ["repeatUntil"],
      });
    }
    if (
      input.repeatUntil.getTime() - input.effectiveFrom.getTime() >
      MAX_WEEKLY_RANGE_MS
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Weekly availability can be scheduled for up to 52 weeks",
        path: ["repeatUntil"],
      });
    }
  });
