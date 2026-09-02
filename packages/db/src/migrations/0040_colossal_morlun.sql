ALTER TABLE "tutor_profile" ADD COLUMN "experience_entries" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
-- Keep the existing public tutor image when it is already present. For older
-- tutor rows that only have the source portrait, promote that portrait to the
-- single canonical auth-user image before removing the duplicate column.
UPDATE "user" AS u
SET "image" = tp."source_photo_url"
FROM "tutor_profile" AS tp
WHERE tp."user_id" = u."id"
  AND tp."source_photo_url" IS NOT NULL
  AND NULLIF(BTRIM(u."image"), '') IS NULL;--> statement-breakpoint
-- Published tutors may have an image proposal in the JSON review payload.
-- Rename that key while the legacy source column is still available.
UPDATE "tutor_profile"
SET "pending_profile_changes" =
  ("pending_profile_changes" - 'sourcePhotoUrl') ||
  jsonb_build_object('profileImageUrl', "pending_profile_changes"->'sourcePhotoUrl')
WHERE "pending_profile_changes" ? 'sourcePhotoUrl'
  AND NOT ("pending_profile_changes" ? 'profileImageUrl')
  AND jsonb_typeof("pending_profile_changes"->'sourcePhotoUrl') = 'string';--> statement-breakpoint
-- Remove the legacy key even when a newer canonical proposal already exists.
UPDATE "tutor_profile"
SET "pending_profile_changes" = "pending_profile_changes" - 'sourcePhotoUrl'
WHERE "pending_profile_changes" ? 'sourcePhotoUrl';--> statement-breakpoint
ALTER TABLE "tutor_profile" DROP COLUMN "source_photo_url";
