ALTER TABLE "tutor_profile" ADD COLUMN "pending_profile_changes" jsonb;
ALTER TABLE "tutor_profile" ADD COLUMN "profile_edit_status" text DEFAULT 'none' NOT NULL;
ALTER TABLE "tutor_profile" ADD COLUMN "profile_edit_admin_note" text;
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_edit_status_check" CHECK ("tutor_profile"."profile_edit_status" IN ('none', 'pending_review', 'changes_requested'));
