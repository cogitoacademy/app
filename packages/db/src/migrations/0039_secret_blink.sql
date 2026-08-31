ALTER TABLE "tutor_profile" ADD COLUMN "education" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "competition_achievements" jsonb DEFAULT '[]'::jsonb;