import { isAuthOutcome, type AuthOutcome } from "@/lib/posthog-auth";

export type LoginSearch = {
  authOutcome?: AuthOutcome;
  redirect?: string;
};

export function validateLoginSearch(
  search: Record<string, string>,
): LoginSearch {
  const redirect = search.redirect;
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    const authOutcome = isAuthOutcome(search.authOutcome)
      ? search.authOutcome
      : undefined;
    return authOutcome ? { authOutcome, redirect } : { redirect };
  }

  return isAuthOutcome(search.authOutcome)
    ? { authOutcome: search.authOutcome }
    : {};
}
