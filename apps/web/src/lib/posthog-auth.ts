export type AuthOutcome = "signed-in" | "created";
export type AuthenticationMethod = "email" | "google";
export type AuthAttribution = {
  outcome: AuthOutcome;
  authenticationMethod: AuthenticationMethod;
};

export const authOutcomeEventName = "cogito:posthog-auth-outcome";
const authOutcomeStorageKey = "cogito:posthog:auth-outcome";

export function isAuthOutcome(
  value: string | null | undefined,
): value is AuthOutcome {
  return value === "signed-in" || value === "created";
}

function isAuthAttribution(value: unknown): value is AuthAttribution {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const attribution = value as Record<string, unknown>;
  return (
    isAuthOutcome(
      typeof attribution.outcome === "string" ? attribution.outcome : undefined,
    ) &&
    (attribution.authenticationMethod === "email" ||
      attribution.authenticationMethod === "google")
  );
}

export function buildAuthCallbackUrl(
  outcome: AuthOutcome,
  redirectPath?: string,
): string {
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  callbackUrl.searchParams.set("authOutcome", outcome);
  if (redirectPath) {
    callbackUrl.searchParams.set("redirect", redirectPath);
  }
  return callbackUrl.toString();
}

export function getAuthEventName(outcome: AuthOutcome) {
  return outcome === "created" ? "account_created" : "account_signed_in";
}

export function rememberAuthOutcome(
  outcome: AuthOutcome,
  authenticationMethod: AuthenticationMethod = "google",
): void {
  try {
    window.sessionStorage.setItem(
      authOutcomeStorageKey,
      JSON.stringify({ outcome, authenticationMethod }),
    );
    window.dispatchEvent(new Event(authOutcomeEventName));
  } catch {
    // Analytics must not block authentication when browser storage is unavailable.
  }
}

export function takeRememberedAuthOutcome(): AuthAttribution | null {
  try {
    const rawValue = window.sessionStorage.getItem(authOutcomeStorageKey);
    if (!rawValue) {
      return null;
    }

    const value: unknown = JSON.parse(rawValue);
    if (!isAuthAttribution(value)) {
      return null;
    }

    window.sessionStorage.removeItem(authOutcomeStorageKey);
    return {
      outcome: value.outcome,
      authenticationMethod: value.authenticationMethod,
    };
  } catch {
    return null;
  }
}
