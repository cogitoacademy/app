import { describe, expect, test } from "bun:test";

import {
  authOutcomeEventName,
  getAuthEventName,
  isAuthOutcome,
  rememberAuthOutcome,
  takeRememberedAuthOutcome,
} from "./posthog-auth";

describe("PostHog auth attribution", () => {
  test("maps OAuth outcomes to auth events", () => {
    expect(getAuthEventName("created")).toBe("account_created");
    expect(getAuthEventName("signed-in")).toBe("account_signed_in");
  });

  test("accepts only known OAuth outcomes", () => {
    expect(isAuthOutcome("created")).toBe(true);
    expect(isAuthOutcome("signed-in")).toBe(true);
    expect(isAuthOutcome("unknown")).toBe(false);
    expect(isAuthOutcome(undefined)).toBe(false);
  });

  test("uses stable event name for callback handoff", () => {
    expect(authOutcomeEventName).toBe("cogito:posthog-auth-outcome");
  });

  test("preserves authentication method through storage handoff", () => {
    const values = new Map<string, string>();
    const events: Event[] = [];
    const previousWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        dispatchEvent: (event: Event) => {
          events.push(event);
          return true;
        },
        sessionStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
      },
    });

    try {
      rememberAuthOutcome("created", "email");

      expect(takeRememberedAuthOutcome()).toEqual({
        outcome: "created",
        authenticationMethod: "email",
      });
      expect(takeRememberedAuthOutcome()).toBeNull();
      expect(events).toHaveLength(1);
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, "window", previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
