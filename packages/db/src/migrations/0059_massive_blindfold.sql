CREATE TABLE "tutor_session_fee" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_session_id" text,
	"tutor_id" text NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"event_key" text NOT NULL,
	"gross_honorarium_idr" integer NOT NULL,
	"price_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_session_fee_amount_nonnegative" CHECK ("tutor_session_fee"."gross_honorarium_idr" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_booking_session_id_booking_session_id_fk" FOREIGN KEY ("booking_session_id") REFERENCES "public"."booking_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_session_fee_event_key_uniq" ON "tutor_session_fee" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_session_fee_booking_uniq" ON "tutor_session_fee" USING btree ("booking_id") WHERE "tutor_session_fee"."booking_session_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_session_fee_session_uniq" ON "tutor_session_fee" USING btree ("booking_session_id") WHERE "tutor_session_fee"."booking_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tutor_session_fee_tutor_earned_idx" ON "tutor_session_fee" USING btree ("tutor_id","earned_at");