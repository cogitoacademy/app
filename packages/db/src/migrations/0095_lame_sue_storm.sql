ALTER TABLE "blog_article" DROP CONSTRAINT "blog_article_valid";--> statement-breakpoint
ALTER TABLE "blog_article" ADD COLUMN "consent_recorded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_article" ADD COLUMN "consent_recorded_at" date;--> statement-breakpoint
ALTER TABLE "blog_article" ADD COLUMN "consent_notes" text;--> statement-breakpoint
ALTER TABLE "blog_article_version" ADD COLUMN "hero_media_id" text;--> statement-breakpoint
UPDATE "blog_article_version" AS v
SET "hero_media_id" = a."hero_media_id"
FROM "blog_article" AS a
WHERE v."article_id" = a."id" AND v."hero_media_id" IS NULL;--> statement-breakpoint
ALTER TABLE "blog_article_version" ADD CONSTRAINT "blog_article_version_hero_media_id_blog_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."blog_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_valid" CHECK ("blog_article"."version" > 0
        AND ("blog_article"."consent_recorded" = false OR "blog_article"."consent_recorded_at" IS NOT NULL));