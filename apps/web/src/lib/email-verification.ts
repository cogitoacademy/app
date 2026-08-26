import { ORPCError } from "@orpc/client";

const EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

export function isEmailVerificationRequired(error: unknown) {
  if (error instanceof ORPCError) {
    return error.code === "FORBIDDEN" && error.message === EMAIL_NOT_VERIFIED;
  }

  if (!error || typeof error !== "object") return false;

  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "FORBIDDEN" && candidate.message === EMAIL_NOT_VERIFIED
  );
}

export function redirectToEmailVerification() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/verify-email") return;

  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const search = new URLSearchParams({ redirect });
  window.location.assign(`/verify-email?${search.toString()}`);
}
