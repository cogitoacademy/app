ALTER TABLE "tutor_profile" ADD COLUMN "online_max_class_size" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "offline_max_class_size" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_online_max_class_size_check" CHECK ("tutor_profile"."online_max_class_size" BETWEEN 1 AND 6);--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_offline_max_class_size_check" CHECK ("tutor_profile"."offline_max_class_size" BETWEEN 1 AND 6);
