CREATE TABLE "tutor_payout_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"payout_id" text NOT NULL,
	"source_key" text NOT NULL,
	"source_type" text NOT NULL,
	"tutor_session_fee_id" text,
	"booking_id" text NOT NULL,
	"booking_session_id" text,
	"booking_type" text NOT NULL,
	"delivery_status" text NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"earned_at" timestamp with time zone NOT NULL,
	"gross_honorarium_idr" integer NOT NULL,
	"price_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_payout_allocation_source_type_check" CHECK ("tutor_payout_allocation"."source_type" IN ('fee_event','legacy_booking','legacy_series_session')),
	CONSTRAINT "tutor_payout_allocation_booking_type_check" CHECK ("tutor_payout_allocation"."booking_type" IN ('solo','group','series')),
	CONSTRAINT "tutor_payout_allocation_delivery_status_check" CHECK ("tutor_payout_allocation"."delivery_status" IN ('completed','no_show')),
	CONSTRAINT "tutor_payout_allocation_amount_check" CHECK ("tutor_payout_allocation"."gross_honorarium_idr" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_payout_id_tutor_payout_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."tutor_payout"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_tutor_session_fee_id_tutor_session_fee_id_fk" FOREIGN KEY ("tutor_session_fee_id") REFERENCES "public"."tutor_session_fee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_booking_session_id_booking_session_id_fk" FOREIGN KEY ("booking_session_id") REFERENCES "public"."booking_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_allocation_source_uniq" ON "tutor_payout_allocation" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_allocation_fee_uniq" ON "tutor_payout_allocation" USING btree ("tutor_session_fee_id") WHERE "tutor_payout_allocation"."tutor_session_fee_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tutor_payout_allocation_payout_start_idx" ON "tutor_payout_allocation" USING btree ("payout_id","scheduled_start_at");