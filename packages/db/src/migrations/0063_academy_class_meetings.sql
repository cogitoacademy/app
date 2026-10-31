CREATE TABLE "academy_class_meeting" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"provider" text DEFAULT 'google_meet' NOT NULL,
	"external_event_id" text,
	"meeting_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_meeting_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "academy_class_meeting_provider_check" CHECK ("academy_class_meeting"."provider" IN ('google_meet', 'manual')),
	CONSTRAINT "academy_class_meeting_status_check" CHECK ("academy_class_meeting"."status" IN ('pending', 'processing', 'created', 'failed')),
	CONSTRAINT "academy_class_meeting_attempt_count_check" CHECK ("academy_class_meeting"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "academy_class_meeting" ADD CONSTRAINT "academy_class_meeting_session_id_academy_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_class_meeting_retry_idx" ON "academy_class_meeting" USING btree ("status","next_retry_at");