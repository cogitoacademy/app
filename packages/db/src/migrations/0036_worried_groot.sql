ALTER TABLE "booking" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_session" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "bank_account_holder_name" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "bank_account_opening_city" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "bank_account_ownership" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "bank_transfer_disclaimer_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_tutor_completedAt_idx" ON "booking" USING btree ("tutor_id","completed_at");--> statement-breakpoint
CREATE INDEX "booking_session_completedAt_idx" ON "booking_session" USING btree ("completed_at");--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_bank_account_ownership_check" CHECK ("tutor_profile"."bank_account_ownership" IS NULL OR "tutor_profile"."bank_account_ownership" IN ('self', 'trusted_person'));
--> statement-breakpoint
-- Preserve a best-effort completion boundary for rows created before the
-- explicit completion timestamps were introduced. New completions write the
-- timestamp at the state transition.
UPDATE "booking"
SET "completed_at" = "updated_at"
WHERE "current_state" = 'completed' AND "completed_at" IS NULL;
--> statement-breakpoint
UPDATE "booking_session"
SET "completed_at" = "updated_at"
WHERE "current_state" = 'completed' AND "completed_at" IS NULL;
