ALTER TABLE "tutor_profile" ADD COLUMN "affiliation" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" RENAME COLUMN "competition_achievements" TO "achievements";--> statement-breakpoint
ALTER TABLE "tutor_profile" RENAME COLUMN "experience_entries" TO "experiences";--> statement-breakpoint
UPDATE "tutor_profile"
SET "pending_profile_changes" = "pending_profile_changes" - 'competitionAchievements' - 'experienceEntries'
WHERE "pending_profile_changes" ?| ARRAY['competitionAchievements', 'experienceEntries'];
