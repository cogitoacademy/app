CREATE TABLE "booking_session" (
	"id" text PRIMARY KEY NOT NULL,
	"series_booking_id" text NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"current_state" text DEFAULT 'scheduled' NOT NULL,
	"hold_amount" integer DEFAULT 0 NOT NULL,
	"price_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_session_state_check" CHECK ("booking_session"."current_state" IN ('scheduled','completed','cancelled','no_show','late_cancelled'))
);
--> statement-breakpoint
ALTER TABLE "booking_session" ADD CONSTRAINT "booking_session_series_booking_id_booking_id_fk" FOREIGN KEY ("series_booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_session_seriesBookingId_idx" ON "booking_session" USING btree ("series_booking_id");--> statement-breakpoint
CREATE INDEX "booking_session_scheduledStartAt_idx" ON "booking_session" USING btree ("scheduled_start_at");