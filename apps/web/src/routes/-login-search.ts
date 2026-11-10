import { isAuthOutcome, type AuthOutcome } from "@/lib/posthog-auth";

export type LoginSearch = {
  authOutcome?: AuthOutcome;
  redirect?: string;
  error?: string;
};

export function validateLoginSearch(
  search: Record<string, string>,
): LoginSearch {
  const error = search.error
    ? {
        error:
          search.error === "signup_disabled"
            ? "signup_disabled"
            : "google_auth_failed",
      }
    : {};
  const redirect = search.redirect;
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    const authOutcome = isAuthOutcome(search.authOutcome)
      ? search.authOutcome
      : undefined;
    return authOutcome
      ? { ...error, authOutcome, redirect }
      : { ...error, redirect };
  }

  return isAuthOutcome(search.authOutcome)
    ? { ...error, authOutcome: search.authOutcome }
    : error;
}
