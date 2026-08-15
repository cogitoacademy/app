import { createHash } from "node:crypto";

/**
 * Hashes an invite token so only the digest is stored at rest (M10). The
 * plaintext token is returned exactly once — at creation/resend — and the
 * invitee presents it later; lookups always hash the incoming token first.
 *
 * @param token - the plaintext invite token
 * @returns the SHA-256 hex digest
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
