CREATE TABLE "kol_commission_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"referred_user_id" text NOT NULL,
	"choice_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"provider_success_at" timestamp with time zone,
	"provider_success_time_state" text DEFAULT 'verified' NOT NULL,
	"purchase_amount_idr_snapshot" integer NOT NULL,
	"flat_amount_idr_snapshot" integer NOT NULL,
	"percent_bps_snapshot" integer NOT NULL,
	"commission_amount_idr" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kol_commission_amounts_nonnegative" CHECK ("kol_commission_decision"."purchase_amount_idr_snapshot" > 0 AND "kol_commission_decision"."flat_amount_idr_snapshot" >= 0 AND "kol_commission_decision"."percent_bps_snapshot" BETWEEN 0 AND 10000 AND "kol_commission_decision"."commission_amount_idr" >= 0),
	CONSTRAINT "kol_commission_success_time_state_check" CHECK ("kol_commission_decision"."provider_success_time_state" IN ('verified', 'unresolved') AND (("kol_commission_decision"."provider_success_time_state" = 'verified' AND "kol_commission_decision"."provider_success_at" IS NOT NULL) OR ("kol_commission_decision"."provider_success_time_state" = 'unresolved' AND "kol_commission_decision"."provider_success_at" IS NULL AND "kol_commission_decision"."commission_amount_idr" = 0)))
);
--> statement-breakpoint
ALTER TABLE "payment_record" ADD COLUMN "provider_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kol_commission_decision" ADD CONSTRAINT "kol_commission_decision_referred_user_id_user_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kol_commission_decision" ADD CONSTRAINT "kol_commission_decision_choice_id_referral_choice_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."referral_choice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kol_commission_decision" ADD CONSTRAINT "kol_commission_decision_payment_id_payment_record_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kol_commission_decision_referred_user_uniq" ON "kol_commission_decision" USING btree ("referred_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kol_commission_decision_payment_uniq" ON "kol_commission_decision" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "kol_commission_decision_success_idx" ON "kol_commission_decision" USING btree ("provider_success_at");
