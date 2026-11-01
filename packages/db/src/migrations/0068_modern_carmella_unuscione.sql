ALTER TABLE "academy_class" ADD COLUMN "minimum_check_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academy_class" ADD COLUMN "free_exit_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academy_class_meeting" ADD COLUMN "schedule_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "academy_class_session" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "academy_class_meeting" ADD CONSTRAINT "academy_class_meeting_schedule_version_positive" CHECK ("academy_class_meeting"."schedule_version" > 0);--> statement-breakpoint
ALTER TABLE "academy_class_session" ADD CONSTRAINT "academy_class_session_version_positive" CHECK ("academy_class_session"."version" > 0);