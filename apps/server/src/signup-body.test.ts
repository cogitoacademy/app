import { describe, expect, test } from "bun:test";

import { hasSignupEmailProof, parseSignupBody } from "./signup-body";

describe("signup request body", () => {
  test("rejects malformed JSON and non-object JSON", () => {
    expect(parseSignupBody('{"email":')).toBeNull();
    expect(parseSignupBody("null")).toBeNull();
    expect(parseSignupBody("[]")).toBeNull();
  });

  test("keeps only string fields used by the auth route", () => {
    expect(
      parseSignupBody(
        JSON.stringify({
          email: "student@example.com",
          password: "Test1234!",
          name: "Student",
          otp: 123456,
          signupAttemptId: "attempt-id",
          ignored: "value",
        }),
      ),
    ).toEqual({
      email: "student@example.com",
      password: "Test1234!",
      name: "Student",
      signupAttemptId: "attempt-id",
    });
  });

  test("requires OTP and attempt ID before public signup", () => {
    const rawSignup = parseSignupBody(
      JSON.stringify({
        email: "student@example.com",
        password: "Test1234!",
        name: "Student",
      }),
    );
    const proofBackedSignup = parseSignupBody(
      JSON.stringify({
        email: "student@example.com",
        password: "Test1234!",
        name: "Student",
        otp: "123456",
        signupAttemptId: "c9f3c62d-c2a2-4b98-8c08-4c34a8c35d10",
      }),
    );

    expect(rawSignup).not.toBeNull();
    expect(hasSignupEmailProof(rawSignup!)).toBe(false);
    expect(proofBackedSignup).not.toBeNull();
    expect(hasSignupEmailProof(proofBackedSignup!)).toBe(true);
  });
});
