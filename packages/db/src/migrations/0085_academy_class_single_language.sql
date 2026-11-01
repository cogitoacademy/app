ALTER TABLE "academy_class" DROP COLUMN IF EXISTS "title_id";--> statement-breakpoint
ALTER TABLE "academy_class" DROP COLUMN IF EXISTS "description_id";--> statement-breakpoint
ALTER TABLE "academy_class_session" DROP COLUMN IF EXISTS "title_id";--> statement-breakpoint
ALTER TABLE "academy_class_session" DROP COLUMN IF EXISTS "curriculum_id";--> statement-breakpoint
ALTER TABLE "academy_class" DROP COLUMN IF EXISTS "cover_key";--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;