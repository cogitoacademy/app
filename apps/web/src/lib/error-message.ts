export const NETWORK_ERROR_MESSAGE =
  "We couldn't connect to Cogito just now. Check your internet connection and try again.";

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";

  const candidate = error as {
    message?: unknown;
    statusText?: unknown;
    error?: { message?: unknown; statusText?: unknown };
  };
  if (typeof candidate.message === "string") return candidate.message.trim();
  if (typeof candidate.error?.message === "string") {
    return candidate.error.message.trim();
  }
  if (typeof candidate.statusText === "string") return candidate.statusText;
  return typeof candidate.error?.statusText === "string"
    ? candidate.error.statusText
    : "";
}

export function getUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message = readErrorMessage(error);
  const normalized = message.toLowerCase();

  if (!message) return fallback;
  if (normalized.includes("input validation")) {
    return "Check the information you entered and try again.";
  }
  if (normalized.includes("unauthorized")) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (
    normalized.includes("email_not_verified") ||
    normalized.includes("email not verified")
  ) {
    return "Verify your email before making a purchase or booking.";
  }
  if (normalized.includes("forbidden")) {
    return "You do not have permission to perform this action.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("load failed") ||
    normalized.includes("err_network")
  ) {
    return NETWORK_ERROR_MESSAGE;
  }

  return message;
}
