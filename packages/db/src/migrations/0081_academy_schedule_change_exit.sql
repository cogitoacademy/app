ALTER TABLE "academy_class_session"
  ADD COLUMN "schedule_change_version" integer,
  ADD COLUMN "schedule_change_notified_at" timestamptz,
  ADD COLUMN "schedule_change_exit_until" timestamptz;

ALTER TABLE "academy_class_session"
  ADD CONSTRAINT "academy_class_session_schedule_change_window_check"
  CHECK (
    ("schedule_change_version" IS NULL AND "schedule_change_notified_at" IS NULL AND "schedule_change_exit_until" IS NULL)
    OR (
      "schedule_change_version" > 0
      AND
      "schedule_change_notified_at" IS NOT NULL
      AND "schedule_change_exit_until" IS NOT NULL
      AND "schedule_change_exit_until" >= "schedule_change_notified_at"
    )
  );
