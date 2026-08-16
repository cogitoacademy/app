ALTER TABLE "achievement" ADD COLUMN "issuer" text;--> statement-breakpoint
ALTER TABLE "achievement" ADD COLUMN "visibility" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_category_check" CHECK ("achievement"."category" IN ('competition','award','certificate','leadership','publication','other'));