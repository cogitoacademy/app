-- Backfill: invite tokens are now stored as SHA-256 digests (BACKEND-REVIEW-HARDENING M10).
-- Existing plaintext tokens are hashed in place; the sha256() function is available in PG 11+.
UPDATE "tutor_invite"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
