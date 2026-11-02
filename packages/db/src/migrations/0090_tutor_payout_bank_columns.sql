-- Production drift repair: migration 0049 is out of timestamp order in the
-- Drizzle journal, so a fresh database run skips its two bank snapshot columns.
-- The journal already lists it as applied, which is why `bun run db:migrate`
-- never retried it. Keep this repair idempotent.
ALTER TABLE "tutor_payout" ADD COLUMN IF NOT EXISTS "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN IF NOT EXISTS "bank_account_holder_name" text;
