ALTER TABLE "subject_category" ALTER COLUMN "is_active" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "name_id" text;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "description_id" text;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "light_text_color" text;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "light_background_color" text;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "dark_text_color" text;--> statement-breakpoint
ALTER TABLE "subject_category" ADD COLUMN "dark_background_color" text;--> statement-breakpoint
UPDATE "subject_category"
SET
	"light_text_color" = CASE "slug"
		WHEN 'competition-model-united-nations' THEN 'oklch(1 0 0)'
		WHEN 'competition-world-scholars-cup' THEN 'oklch(1 0 0)'
		WHEN 'competition-essay-writing' THEN 'oklch(1 0 0)'
		WHEN 'competition-debate' THEN 'oklch(1 0 0)'
		WHEN 'competition-business' THEN 'oklch(0.2036 0.0029 247.97)'
		WHEN 'competition-olympiad' THEN 'oklch(1 0 0)'
		WHEN 'competition-public-speaking' THEN 'oklch(1 0 0)'
		ELSE 'oklch(0.2036 0.0029 247.97)'
	END,
	"light_background_color" = CASE "slug"
		WHEN 'competition-model-united-nations' THEN 'oklch(0.695641 0.132326 232.54)'
		WHEN 'competition-world-scholars-cup' THEN 'oklch(0.884795 0.181642 94.9)'
		WHEN 'competition-essay-writing' THEN 'oklch(0.698358 0.202646 44.07)'
		WHEN 'competition-debate' THEN 'oklch(0.581114 0.199813 315.44)'
		WHEN 'competition-business' THEN 'oklch(0.804266 0.214364 151.41)'
		WHEN 'competition-olympiad' THEN 'oklch(0.566845 0.202167 31.43)'
		WHEN 'competition-public-speaking' THEN 'oklch(0.773372 0.101596 354.57)'
		ELSE 'oklch(0.9616 0.0011 247.83)'
	END,
	"dark_text_color" = CASE "slug"
		WHEN 'competition-model-united-nations' THEN 'oklch(1 0 0)'
		WHEN 'competition-world-scholars-cup' THEN 'oklch(1 0 0)'
		WHEN 'competition-essay-writing' THEN 'oklch(1 0 0)'
		WHEN 'competition-debate' THEN 'oklch(1 0 0)'
		WHEN 'competition-business' THEN 'oklch(0.2036 0.0029 247.97)'
		WHEN 'competition-olympiad' THEN 'oklch(1 0 0)'
		WHEN 'competition-public-speaking' THEN 'oklch(1 0 0)'
		ELSE 'oklch(0.977 0.0007 247.83)'
	END,
	"dark_background_color" = CASE "slug"
		WHEN 'competition-model-united-nations' THEN 'oklch(0.695641 0.132326 232.54)'
		WHEN 'competition-world-scholars-cup' THEN 'oklch(0.884795 0.181642 94.9)'
		WHEN 'competition-essay-writing' THEN 'oklch(0.698358 0.202646 44.07)'
		WHEN 'competition-debate' THEN 'oklch(0.581114 0.199813 315.44)'
		WHEN 'competition-business' THEN 'oklch(0.804266 0.214364 151.41)'
		WHEN 'competition-olympiad' THEN 'oklch(0.566845 0.202167 31.43)'
		WHEN 'competition-public-speaking' THEN 'oklch(0.773372 0.101596 354.57)'
		ELSE 'oklch(0.2888 0.0039 264.5)'
	END
WHERE "parent_id" IS NULL;--> statement-breakpoint
ALTER TABLE "subject_category" ADD CONSTRAINT "subject_category_palette_hierarchy_check" CHECK (("subject_category"."parent_id" IS NULL AND "subject_category"."light_text_color" IS NOT NULL AND "subject_category"."light_background_color" IS NOT NULL AND "subject_category"."dark_text_color" IS NOT NULL AND "subject_category"."dark_background_color" IS NOT NULL) OR ("subject_category"."parent_id" IS NOT NULL AND "subject_category"."light_text_color" IS NULL AND "subject_category"."light_background_color" IS NULL AND "subject_category"."dark_text_color" IS NULL AND "subject_category"."dark_background_color" IS NULL));
