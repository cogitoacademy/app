-- Separate private verification evidence from optional public documentation.
ALTER TABLE "achievement" RENAME COLUMN "event_date" TO "awarding_date";
ALTER TABLE "achievement" RENAME COLUMN "image_url" TO "evidence_url";
ALTER TABLE "achievement" ADD COLUMN "documentation_url" text;
