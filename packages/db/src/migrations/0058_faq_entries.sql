CREATE TABLE "faq_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"question_en" text NOT NULL,
	"question_id" text,
	"answer_en" jsonb NOT NULL,
	"answer_id" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_on_landing" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "faq_entry_sort_order_nonnegative" CHECK ("faq_entry"."sort_order" >= 0),
	CONSTRAINT "faq_entry_version_positive" CHECK ("faq_entry"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX "faq_entry_public_order_idx" ON "faq_entry" USING btree ("is_active","sort_order","id");--> statement-breakpoint
CREATE INDEX "faq_entry_landing_order_idx" ON "faq_entry" USING btree ("is_active","show_on_landing","sort_order","id");