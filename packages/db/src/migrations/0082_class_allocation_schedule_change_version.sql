ALTER TABLE "academy_class_enrollment_allocation"
  ADD COLUMN "schedule_change_version" integer;

ALTER TABLE "academy_class_enrollment_allocation"
  ADD CONSTRAINT "academy_class_enrollment_allocation_schedule_change_version_check"
  CHECK ("schedule_change_version" IS NULL OR "schedule_change_version" > 0);
