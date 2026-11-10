import {
  ATTRIBUTION_KEYS,
  SIGNUP_SOURCE_COOKIE,
  signupSourceFromCookie,
  type SignupTouch,
} from "@cogito-app/auth/signup-source";

/** Capture locally before analytics initialize; attribution never leaves our domains. */
export function captureSignupSource() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const touch: SignupTouch = { at: new Date().toISOString() };
  let tagged = false;
  for (const key of ATTRIBUTION_KEYS) {
    const value = url.searchParams.get(key);
    if (value !== null && value.length <= 200) {
      touch[key] = value;
      tagged = true;
    }
    url.searchParams.delete(key);
  }
  const previous = signupSourceFromCookie(document.cookie);
  if (tagged || !previous) {
    const next = {
      firstTouch: previous?.firstTouch ?? touch,
      lastTouch: touch,
    };
    const domain =
      location.hostname === "cogitoacademy.id" ||
      location.hostname.endsWith(".cogitoacademy.id")
        ? "; Domain=.cogitoacademy.id"
        : "";
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=7776000; Path=/; SameSite=Lax${domain}${location.protocol === "https:" ? "; Secure" : ""}`;
  }
  if (url.href !== window.location.href)
    history.replaceState(history.state, "", url.href);
}
