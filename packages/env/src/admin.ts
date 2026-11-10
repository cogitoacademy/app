export const DEFAULT_PRODUCTION_ADMIN_EMAIL = "itcogitoacademy01@gmail.com";

/**
 * Administrators who govern other administrators and cannot be demoted
 * through the app. Keep this list small and explicit.
 */
export const SUPER_ADMIN_EMAILS = [
  "cogitoacademy.id@gmail.com",
  DEFAULT_PRODUCTION_ADMIN_EMAIL,
] as const;

export function isSuperAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return SUPER_ADMIN_EMAILS.includes(
    normalized as (typeof SUPER_ADMIN_EMAILS)[number],
  );
}

export function parseConfiguredAdminEmails(
  value: string | undefined,
): string[] {
  const source = value?.trim() || DEFAULT_PRODUCTION_ADMIN_EMAIL;

  return Array.from(
    new Set(
      source
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => !!email && !isPublicTestMailbox(email)),
    ),
  );
}

/** Public test inboxes cannot be configured as operators, including at boot. */
export function isPublicTestMailbox(email: string): boolean {
  return /@(yopmail\.com|yopmail\.fr|yopmail\.net)$/i.test(email.trim());
}

export function isConfiguredAdminEmail(
  email: string,
  configuredEmails: string | undefined,
): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return parseConfiguredAdminEmails(configuredEmails).includes(normalizedEmail);
}
