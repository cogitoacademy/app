CREATE TABLE "tutor_payout" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"gross_honorarium_idr" integer NOT NULL,
	"transfer_fee_idr" integer DEFAULT 0 NOT NULL,
	"net_honorarium_idr" integer NOT NULL,
	"bank_name" text NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"paid_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_payout_status_check" CHECK ("tutor_payout"."status" IN ('paid')),
	CONSTRAINT "tutor_payout_amounts_check" CHECK ("tutor_payout"."gross_honorarium_idr" >= 0 AND "tutor_payout"."transfer_fee_idr" >= 0 AND "tutor_payout"."net_honorarium_idr" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutor_payout_tutor_cutoff_idx" ON "tutor_payout" USING btree ("tutor_id","cutoff_at");--> statement-breakpoint
CREATE INDEX "tutor_payout_paid_at_idx" ON "tutor_payout" USING btree ("paid_at");