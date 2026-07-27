CREATE INDEX IF NOT EXISTS "booking_tutor_id_scheduled_start_at_scheduled_end_at_idx"
  ON "booking" ("tutor_id", "scheduled_start_at", "scheduled_end_at");