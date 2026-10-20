export type SignupBody = {
  email?: string;
  password?: string;
  name?: string;
  otp?: string;
  signupAttemptId?: string;
};

export function hasSignupEmailProof(
  body: SignupBody,
): body is SignupBody & {
  email: string;
  password: string;
  name: string;
  otp: string;
  signupAttemptId: string;
} {
  return Boolean(
    body.email &&
      body.password &&
      body.name &&
      body.otp &&
      body.signupAttemptId,
  );
}

export function parseSignupBody(body: string): SignupBody | null {
  try {
    const parsed: unknown = JSON.parse(body || "{}");
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    return {
      ...(typeof value.email === "string" ? { email: value.email } : {}),
      ...(typeof value.password === "string"
        ? { password: value.password }
        : {}),
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(typeof value.otp === "string" ? { otp: value.otp } : {}),
      ...(typeof value.signupAttemptId === "string"
        ? { signupAttemptId: value.signupAttemptId }
        : {}),
    };
  } catch {
    return null;
  }
}
