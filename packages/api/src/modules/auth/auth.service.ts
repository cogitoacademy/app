import type { z } from "zod";
import { ORPCError } from "@orpc/server";
import { updateProfileInput } from "./auth.types";

export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

type AuthError = ORPCError<"BAD_REQUEST", undefined>;

export type ValidationResult = { ok: true } | { ok: false; error: AuthError };

export function validateUpdateInput(
  input: UpdateProfileInput,
): ValidationResult {
  const stringFields = [
    "phoneNumber",
    "schoolName",
    "gradeLevel",
    "parentName",
    "parentPhone",
    "parentEmail",
  ] as const;

  for (const field of stringFields) {
    const value = input[field];
    if (value !== undefined && value.trim() === "") {
      return {
        ok: false,
        error: new ORPCError("BAD_REQUEST", {
          message: `${field} cannot be blank`,
        }),
      };
    }
  }

  return { ok: true };
}
