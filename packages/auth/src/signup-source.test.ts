import { describe, expect, test } from "bun:test";
import {
  parseSignupSource,
  signupReportingSource,
  signupSourceFromCookie,
} from "./signup-source";

describe("signup attribution", () => {
  const at = "2026-11-10T00:00:00.000Z";
  test("accepts tagged first and last touch, strips all other fields", () => {
    const parsed = parseSignupSource({
      firstTouch: {
        at,
        utm_source: "instagram",
        utm_campaign: "test",
        email: "private@example.com",
        utm_content: "x".repeat(201),
      },
      lastTouch: { at, utm_source: "google" },
      manual: "school",
      token: "secret",
    });
    expect(parsed).toEqual({
      firstTouch: { at, utm_source: "instagram", utm_campaign: "test" },
      lastTouch: { at, utm_source: "google" },
    });
    expect(signupReportingSource(parsed)).toEqual({
      source: "instagram",
      campaign: "test",
    });
  });
  test("manual attribution wins and direct is the fallback", () => {
    expect(
      signupReportingSource({
        firstTouch: { at, utm_source: "instagram", utm_campaign: "test" },
        manual: "school",
      }),
    ).toEqual({ source: "school", campaign: "test" });
    expect(signupReportingSource(null)).toEqual({
      source: "direct",
      campaign: "",
    });
  });
  test("malformed, oversized, invalid time cookie fails closed", () => {
    expect(signupSourceFromCookie("cogito_signup_source=%ZZ")).toBeNull();
    expect(
      signupSourceFromCookie(`cogito_signup_source=${"x".repeat(6001)}`),
    ).toBeNull();
    expect(
      parseSignupSource({ firstTouch: { at: "not a date", utm_source: "x" } }),
    ).toBeNull();
    const value = {
      firstTouch: { at, utm_source: "instagram", utm_campaign: "test" },
    };
    expect(
      signupSourceFromCookie(
        `other=x; cogito_signup_source=${encodeURIComponent(JSON.stringify(value))}; session=y`,
      ),
    ).toEqual(value);
  });
});
