export function getUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  const normalized = message.toLowerCase();

  if (!message) return fallback;
  if (normalized.includes("input validation")) {
    return "Check the information you entered and try again.";
  }
  if (normalized.includes("unauthorized")) {
    return "Your session has expired. Sign in again to continue.";
  }
  if (normalized.includes("forbidden")) {
    return "You do not have permission to perform this action.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network")
  ) {
    return "The service could not be reached. Check your connection and try again.";
  }

  return message;
}
