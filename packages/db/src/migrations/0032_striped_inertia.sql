ALTER TABLE "tutor_profile" ADD COLUMN "achievements" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "experiences" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "source_photo_url" text;
--> statement-breakpoint
UPDATE "tutor_profile"
SET "achievements" = "credentials_summary"
WHERE "credentials_summary" IS NOT NULL AND "achievements" IS NULL;
