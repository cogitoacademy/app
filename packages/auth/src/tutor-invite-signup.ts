export function canUseTutorInviteForSignup(
  invite: { email: string; status: string; expiresAt: Date } | undefined,
  email: string,
  now = new Date(),
): boolean {
  return Boolean(
    invite &&
    invite.status === "invited" &&
    invite.expiresAt > now &&
    invite.email.toLowerCase() === email.trim().toLowerCase(),
  );
}
