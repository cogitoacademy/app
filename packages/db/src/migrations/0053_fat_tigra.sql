ALTER TABLE "achievement" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "achievement_deletedAt_idx" ON "achievement" USING btree ("deleted_at");