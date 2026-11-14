ALTER TABLE "referral_campaign" ADD COLUMN "welcome_marks" integer;
--> statement-breakpoint
UPDATE "referral_campaign" SET "welcome_marks" = coalesce((SELECT "welcome_marks" FROM "referral_settings_revision" WHERE "effective_at" <= now() ORDER BY "effective_at" DESC, "version" DESC LIMIT 1), 15);
--> statement-breakpoint
ALTER TABLE "referral_campaign" ALTER COLUMN "welcome_marks" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD CONSTRAINT "referral_campaign_welcome_marks_valid" CHECK ("referral_campaign"."welcome_marks" BETWEEN 0 AND 100000);