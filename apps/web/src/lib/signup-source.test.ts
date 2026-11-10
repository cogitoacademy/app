import { expect, test } from "bun:test";
import { captureSignupSource } from "./signup-source";
import { signupSourceFromCookie } from "@cogito-app/auth/signup-source";

test("first party cookie preserves first touch, records last touch and strips analytics URL", () => {
  const names = ["window", "location", "document", "history"] as const;
  const previous = names.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  const location = new URL(
    "https://app.cogitoacademy.id/?utm_source=instagram&utm_campaign=test&fbclid=click-1&keep=1",
  );
  const document = { cookie: "" };
  const history = {
    state: null,
    replaceState(_state: unknown, _unused: string, value: string) {
      location.href = value;
    },
  };
  try {
    for (const [key, value] of Object.entries({
      window: { location },
      location,
      document,
      history,
    }))
      Object.defineProperty(globalThis, key, { value, configurable: true });
    captureSignupSource();
    let saved = signupSourceFromCookie(document.cookie);
    expect(saved?.firstTouch?.utm_source).toBe("instagram");
    expect(saved?.firstTouch?.utm_campaign).toBe("test");
    expect(document.cookie).toContain("Domain=.cogitoacademy.id");
    expect(document.cookie).toContain("Max-Age=7776000");
    expect(document.cookie).toContain("SameSite=Lax");
    expect(document.cookie).toContain("Secure");
    expect(location.href).toBe("https://app.cogitoacademy.id/?keep=1");
    location.href =
      "https://app.cogitoacademy.id/?utm_source=google&utm_campaign=later";
    captureSignupSource();
    saved = signupSourceFromCookie(document.cookie);
    expect(saved?.firstTouch?.utm_source).toBe("instagram");
    expect(saved?.lastTouch?.utm_source).toBe("google");
    expect(saved?.lastTouch?.utm_campaign).toBe("later");
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
