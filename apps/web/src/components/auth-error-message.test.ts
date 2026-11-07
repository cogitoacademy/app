import { expect, test } from "bun:test";
import { getAuthErrorMessage } from "./auth-error-message";

test("specific login failures take precedence over generic 401 guidance", () => {
  for (const [code, text] of [
    ["USER_NOT_FOUND", "No account was found"],
    ["INVALID_PASSWORD", "password is incorrect"],
    ["GOOGLE_SIGN_IN_REQUIRED", "continue with Google"],
    ["EMAIL_NOT_VERIFIED", "verify your email"],
  ]) {
    expect(getAuthErrorMessage({ code, status: 401 }, "sign-in")).toContain(
      text,
    );
  }
});
test("generic failures include conditional Google guidance", () => {
  for (const error of [
    { code: "INVALID_EMAIL_OR_PASSWORD" },
    { code: "INVALID_USER" },
    { status: 401 },
  ]) {
    expect(getAuthErrorMessage(error, "sign-in")).toContain(
      "If you signed up with Google",
    );
  }
});
