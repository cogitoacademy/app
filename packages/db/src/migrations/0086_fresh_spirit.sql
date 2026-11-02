CREATE TABLE "blog_article" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"subcategory_id" text,
	"hero_media_id" text,
	"featured_tutor_id" text,
	"reviewed_by_tutor_id" text,
	"internal_notes" text,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_article_valid" CHECK ("blog_article"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "blog_article_gallery" (
	"article_id" text NOT NULL,
	"media_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"alt_id" text,
	"alt_en" text,
	CONSTRAINT "blog_article_gallery_article_id_media_id_pk" PRIMARY KEY("article_id","media_id"),
	CONSTRAINT "blog_article_gallery_valid" CHECK ("blog_article_gallery"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blog_article_related" (
	"article_id" text NOT NULL,
	"related_article_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "blog_article_related_article_id_related_article_id_pk" PRIMARY KEY("article_id","related_article_id"),
	CONSTRAINT "blog_article_related_valid" CHECK ("blog_article_related"."article_id" <> "blog_article_related"."related_article_id" AND "blog_article_related"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blog_article_version" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"locale" text NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"lead" text DEFAULT '' NOT NULL,
	"main_keyword" text,
	"secondary_keywords" jsonb,
	"key_facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hero_alt" text,
	"reading_minutes" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_article_version_valid" CHECK ("blog_article_version"."locale" IN ('id','en')
        AND "blog_article_version"."status" IN ('draft','in_review','published','archived')
        AND "blog_article_version"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND "blog_article_version"."version" > 0
        AND "blog_article_version"."reading_minutes" > 0
        AND ("blog_article_version"."status" <> 'published' OR "blog_article_version"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "blog_category" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"title_id" text NOT NULL,
	"title_en" text NOT NULL,
	"slug_id" text NOT NULL,
	"slug_en" text NOT NULL,
	"intro_id" text,
	"intro_en" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_category_valid" CHECK (length(trim("blog_category"."title_id")) > 0
        AND length(trim("blog_category"."title_en")) > 0
        AND "blog_category"."slug_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND "blog_category"."slug_en" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND "blog_category"."version" > 0
        AND "blog_category"."sort_order" >= 0
        AND ("blog_category"."parent_id" IS NULL OR "blog_category"."parent_id" <> "blog_category"."id"))
);
--> statement-breakpoint
CREATE TABLE "blog_media" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"byte_size" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_media_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "blog_media_valid" CHECK (length(trim("blog_media"."filename")) > 0
        AND "blog_media"."content_type" IN ('image/png','image/jpeg','image/webp','image/gif')
        AND ("blog_media"."width" IS NULL OR ("blog_media"."width" > 0 AND "blog_media"."width" <= 20000))
        AND ("blog_media"."height" IS NULL OR ("blog_media"."height" > 0 AND "blog_media"."height" <= 20000))
        AND ("blog_media"."width" IS NULL OR "blog_media"."height" IS NOT NULL)
        AND ("blog_media"."byte_size" IS NULL OR ("blog_media"."byte_size" > 0 AND "blog_media"."byte_size" <= 5242880)))
);
--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_category_id_blog_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_subcategory_id_blog_category_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."blog_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_hero_media_id_blog_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "public"."blog_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_featured_tutor_id_tutor_profile_id_fk" FOREIGN KEY ("featured_tutor_id") REFERENCES "public"."tutor_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_reviewed_by_tutor_id_tutor_profile_id_fk" FOREIGN KEY ("reviewed_by_tutor_id") REFERENCES "public"."tutor_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article" ADD CONSTRAINT "blog_article_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_gallery" ADD CONSTRAINT "blog_article_gallery_article_id_blog_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_gallery" ADD CONSTRAINT "blog_article_gallery_media_id_blog_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."blog_media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_related" ADD CONSTRAINT "blog_article_related_article_id_blog_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_related" ADD CONSTRAINT "blog_article_related_related_article_id_blog_article_id_fk" FOREIGN KEY ("related_article_id") REFERENCES "public"."blog_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_article_version" ADD CONSTRAINT "blog_article_version_article_id_blog_article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."blog_article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_category" ADD CONSTRAINT "blog_category_parent_id_blog_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blog_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_media" ADD CONSTRAINT "blog_media_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blog_article_category_idx" ON "blog_article" USING btree ("category_id","subcategory_id");--> statement-breakpoint
CREATE INDEX "blog_article_archived_idx" ON "blog_article" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "blog_article_gallery_order_idx" ON "blog_article_gallery" USING btree ("article_id","sort_order");--> statement-breakpoint
CREATE INDEX "blog_article_related_order_idx" ON "blog_article_related" USING btree ("article_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_article_version_article_locale_unique" ON "blog_article_version" USING btree ("article_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_article_version_locale_slug_unique" ON "blog_article_version" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "blog_article_version_status_locale_published_idx" ON "blog_article_version" USING btree ("status","locale","published_at");--> statement-breakpoint
CREATE INDEX "blog_article_version_article_idx" ON "blog_article_version" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_slug_id_unique" ON "blog_category" USING btree ("slug_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blog_category_slug_en_unique" ON "blog_category" USING btree ("slug_en");--> statement-breakpoint
CREATE INDEX "blog_category_active_parent_sort_idx" ON "blog_category" USING btree ("is_active","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "blog_media_created_by_idx" ON "blog_media" USING btree ("created_by");