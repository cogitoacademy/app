import z from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .pipe(z.email("Enter a valid email address"));

const passwordSchema = z
  .string()
  .min(1, "Password is required")
  .refine(
    (value) => value.length === 0 || value.length >= 8,
    "Password must be at least 8 characters",
  );

const signUpPasswordSchema = passwordSchema
  .refine(
    (value) => value.length === 0 || /[A-Z]/.test(value),
    "Password must contain at least one uppercase letter",
  )
  .refine(
    (value) => value.length === 0 || /[a-z]/.test(value),
    "Password must contain at least one lowercase letter",
  )
  .refine(
    (value) => value.length === 0 || /[0-9]/.test(value),
    "Password must contain at least one digit",
  );

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .refine(
    (value) => value.length === 0 || value.length >= 2,
    "Name must be at least 2 characters",
  );

export const signInEmailSchema = emailSchema;
export const signInPasswordSchema = passwordSchema;
export const signUpNameSchema = nameSchema;
export const signUpPasswordPolicySchema = signUpPasswordSchema;

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: signUpPasswordSchema,
});

export function getFieldErrorMessages(errors: readonly unknown[]) {
  const messages = errors
    .map((error) => {
      if (typeof error === "string") return error;
      if (!error || typeof error !== "object" || !("message" in error)) {
        return undefined;
      }

      const message = (error as { message?: unknown }).message;
      return typeof message === "string" ? message : undefined;
    })
    .filter((message): message is string => Boolean(message));

  return [...new Set(messages)];
}
