ALTER TABLE "academy_class" DROP COLUMN IF EXISTS "title_id";--> statement-breakpoint
ALTER TABLE "academy_class" DROP COLUMN IF EXISTS "description_id";--> statement-breakpoint
ALTER TABLE "academy_class_session" DROP COLUMN IF EXISTS "title_id";--> statement-breakpoint
ALTER TABLE "academy_class_session" DROP COLUMN IF EXISTS "curriculum_id";