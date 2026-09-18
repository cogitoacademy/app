CREATE TABLE "session_completion_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"session_id" text,
	"author_id" text NOT NULL,
	"discussion" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_completion_feedback" ADD CONSTRAINT "session_completion_feedback_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_completion_feedback" ADD CONSTRAINT "session_completion_feedback_session_id_booking_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_completion_feedback" ADD CONSTRAINT "session_completion_feedback_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_feedback_bookingId_idx" ON "session_completion_feedback" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "session_feedback_sessionId_idx" ON "session_completion_feedback" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_feedback_authorId_idx" ON "session_completion_feedback" USING btree ("author_id");
