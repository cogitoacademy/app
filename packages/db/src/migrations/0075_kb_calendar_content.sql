CREATE TABLE "calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"source_hash" text,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"education_levels" jsonb NOT NULL,
	"scale" text,
	"organizer" text,
	"registration_deadline" timestamp with time zone,
	"registration_link" text,
	"social_media_link" text,
	CONSTRAINT "calendar_event_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "calendar_event_valid" CHECK (length(trim("calendar_event"."title")) > 0 AND "calendar_event"."version" > 0 AND "calendar_event"."sort_order" >= 0 AND "calendar_event"."end_date" >= "calendar_event"."start_date")
);
--> statement-breakpoint
CREATE TABLE "calendar_event_category" (
	"event_id" text NOT NULL,
	"category_id" text NOT NULL,
	CONSTRAINT "calendar_event_category_event_id_category_id_pk" PRIMARY KEY("event_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "kb_file" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kb_file_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "kb_file_bytes" CHECK ("kb_file"."bytes" > 0 AND "kb_file"."bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "kb_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"source_hash" text,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"file_id" text NOT NULL,
	CONSTRAINT "kb_resource_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "kb_resource_valid" CHECK (length(trim("kb_resource"."title")) > 0 AND "kb_resource"."version" > 0 AND "kb_resource"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "calendar_event_category" ADD CONSTRAINT "calendar_event_category_event_id_calendar_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_category" ADD CONSTRAINT "calendar_event_category_category_id_subject_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."subject_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_resource" ADD CONSTRAINT "kb_resource_file_id_kb_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."kb_file"("id") ON DELETE restrict ON UPDATE no action;