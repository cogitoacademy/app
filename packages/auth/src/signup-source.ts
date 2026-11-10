export const SIGNUP_SOURCE_COOKIE = "cogito_signup_source";
export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "fbclid",
] as const;
export type SignupTouch = Partial<
  Record<(typeof ATTRIBUTION_KEYS)[number], string>
> & { at: string };
export interface SignupSource {
  firstTouch?: SignupTouch;
  lastTouch?: SignupTouch;
  manual?: "whatsapp" | "school" | "event" | "friend" | "other";
}

export function parseSignupSource(value: unknown): SignupSource | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const result: SignupSource = {};
  for (const key of ["firstTouch", "lastTouch"] as const) {
    const raw = source[key];
    if (!raw || typeof raw !== "object") continue;
    const touch = raw as Record<string, unknown>;
    if (typeof touch.at !== "string" || !Number.isFinite(Date.parse(touch.at)))
      continue;
    const clean: SignupTouch = { at: new Date(touch.at).toISOString() };
    for (const field of ATTRIBUTION_KEYS) {
      if (typeof touch[field] === "string" && touch[field].length <= 200)
        clean[field] = touch[field];
    }
    result[key] = clean;
  }
  return result.firstTouch || result.lastTouch ? result : null;
}

export function signupSourceFromCookie(
  cookie: string | null | undefined,
): SignupSource | null {
  const encoded = cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SIGNUP_SOURCE_COOKIE}=`))
    ?.slice(SIGNUP_SOURCE_COOKIE.length + 1);
  if (!encoded || encoded.length > 6000) return null;
  try {
    return parseSignupSource(JSON.parse(decodeURIComponent(encoded)));
  } catch {
    return null;
  }
}

export function signupReportingSource(value: SignupSource | null) {
  return {
    source: value?.manual ?? value?.firstTouch?.utm_source ?? "direct",
    campaign: value?.firstTouch?.utm_campaign ?? "",
  };
}
