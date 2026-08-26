export const DEFAULT_PRODUCTION_ADMIN_EMAIL = "itcogitoacademy01@gmail.com";

export function parseConfiguredAdminEmails(
  value: string | undefined,
): string[] {
  const source = value?.trim() || DEFAULT_PRODUCTION_ADMIN_EMAIL;

  return Array.from(
    new Set(
      source
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function isConfiguredAdminEmail(
  email: string,
  configuredEmails: string | undefined,
): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  return parseConfiguredAdminEmails(configuredEmails).includes(normalizedEmail);
}
