ALTER TABLE "activity_article" DROP CONSTRAINT "activity_article_valid";
--> statement-breakpoint
ALTER TABLE "activity_article" DROP COLUMN "end_at";
--> statement-breakpoint
ALTER TABLE "activity_article" ADD CONSTRAINT "activity_article_valid" CHECK ("activity_article"."state" IN ('draft','published','cancelled','postponed') AND "activity_article"."version" > 0);