type AuthErrorContext = "sign-in" | "sign-up";

type AuthErrorShape = {
  code?: unknown;
  message?: unknown;
  status?: unknown;
};

function readError(error: unknown): AuthErrorShape {
  return error && typeof error === "object"
    ? (error as AuthErrorShape)
    : {};
}

export function getAuthErrorMessage(
  error: unknown,
  context: AuthErrorContext,
) {
  const candidate = readError(error);
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const status =
    typeof candidate.status === "number" ? candidate.status : undefined;

  if (context === "sign-in") {
    if (code === "USER_NOT_FOUND" || code === "USER_EMAIL_NOT_FOUND") {
      return "No account was found for this email. Please sign up first.";
    }

    if (code === "INVALID_PASSWORD") {
      return "That password is incorrect. Try again or reset your password.";
    }

    if (code === "EMAIL_NOT_VERIFIED") {
      return "Please verify your email before signing in. Check your inbox for the verification code.";
    }

    if (
      code === "INVALID_EMAIL_OR_PASSWORD" ||
      code === "INVALID_USER" ||
      status === 401
    ) {
      return "The email or password is incorrect. If you do not have an account yet, please sign up first.";
    }
  }

  if (context === "sign-up") {
    if (
      code === "USER_ALREADY_EXISTS" ||
      code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
    ) {
      return "An account with this email already exists. Please sign in instead.";
    }

    if (code === "PASSWORD_TOO_SHORT") {
      return "Choose a password with at least 8 characters.";
    }
  }

  if (code === "INVALID_EMAIL") {
    return "Enter a valid email address.";
  }

  const message =
    typeof candidate.message === "string" ? candidate.message.trim() : "";
  return (
    message ||
    (context === "sign-in"
      ? "Unable to sign in. Please try again."
      : "Unable to sign up. Please try again.")
  );
}
