export function parseSignupBody(body: string): { password?: string } | null {
  try {
    const parsed: unknown = JSON.parse(body || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as { password?: string };
  } catch {
    return null;
  }
}
