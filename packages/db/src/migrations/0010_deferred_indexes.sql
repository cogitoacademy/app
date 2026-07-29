CREATE INDEX IF NOT EXISTS "idx_booking_status_deadline" ON "booking" ("current_state", "deadline_at");
CREATE INDEX IF NOT EXISTS "idx_booking_participant_user" ON "booking_participant" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_tutor_profile_status_published" ON "tutor_profile" ("onboarding_status", "published_at");
CREATE UNIQUE INDEX IF NOT EXISTS "booking_participant_booking_user_uniq" ON "booking_participant" ("booking_id", "user_id");