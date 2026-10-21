CREATE TABLE "session_completion_feedback_history" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"session_id" text,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"actor_id" text,
	"actor_role" text NOT NULL,
	"reason" text,
	"delivery_confirmed" boolean,
	"discussion" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"request_key" uuid,
	"request_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_feedback_history_version_check" CHECK ("session_completion_feedback_history"."version" > 0),
	CONSTRAINT "session_feedback_history_status_check" CHECK ("session_completion_feedback_history"."status" IN ('submitted','corrected','legacy_snapshot')),
	CONSTRAINT "session_feedback_history_actor_check" CHECK ("session_completion_feedback_history"."actor_role" IN ('admin','tutor','legacy'))
);
--> statement-breakpoint
ALTER TABLE "session_completion_feedback" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_completion_feedback_history" ADD CONSTRAINT "session_completion_feedback_history_feedback_id_session_completion_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."session_completion_feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_completion_feedback_history" ADD CONSTRAINT "session_completion_feedback_history_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_completion_feedback_history" ADD CONSTRAINT "session_completion_feedback_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_feedback_history_feedback_version_uniq" ON "session_completion_feedback_history" USING btree ("feedback_id","version");--> statement-breakpoint
CREATE INDEX "session_feedback_history_booking_session_idx" ON "session_completion_feedback_history" USING btree ("booking_id","session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_feedback_history_request_key_uniq" ON "session_completion_feedback_history" USING btree ("request_key");