CREATE INDEX "idx_booking_status_deadline" ON "booking" USING btree ("current_state","deadline_at");--> statement-breakpoint
CREATE INDEX "idx_booking_participant_user" ON "booking_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tutor_profile_status_published" ON "tutor_profile" USING btree ("onboarding_status","published_at");