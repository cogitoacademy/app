CREATE TABLE "tutor_tax_config" (
	"id" text PRIMARY KEY NOT NULL,
	"nik_npwp_rate_bps" integer DEFAULT 250 NOT NULL,
	"nik_only_rate_bps" integer DEFAULT 300 NOT NULL,
	"missing_rate_bps" integer DEFAULT 300 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_tax_config_rates_check" CHECK ("tutor_tax_config"."nik_npwp_rate_bps" BETWEEN 0 AND 10000 AND "tutor_tax_config"."nik_only_rate_bps" BETWEEN 0 AND 10000 AND "tutor_tax_config"."missing_rate_bps" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
ALTER TABLE "tutor_payout" DROP CONSTRAINT "tutor_payout_status_check";--> statement-breakpoint
ALTER TABLE "tutor_payout" DROP CONSTRAINT "tutor_payout_amounts_check";--> statement-breakpoint
DROP INDEX "tutor_payout_allocation_source_uniq";--> statement-breakpoint
DROP INDEX "tutor_payout_allocation_fee_uniq";--> statement-breakpoint
ALTER TABLE "tutor_payout" ALTER COLUMN "paid_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_payout" ALTER COLUMN "paid_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "tax_legal_name" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "nik" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "npwp" text;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD COLUMN "tax_rate_override_bps" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "preview_version" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "source_keys" jsonb;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_status" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_rate_bps" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_rate_source" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_honorarium_idr" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "bank_account_opening_city" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "bank_account_ownership" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_legal_name" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_nik" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_npwp" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_profile_version" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "tax_config_version" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "actual_amount_idr" integer;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "actual_reference" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "actual_proof_url" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "transfer_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "prepared_by" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "reconciliation_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "reconciliation_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "reconciliation_resolved_by" text;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD COLUMN "reconciliation_reason" text;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "released_by" text;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "release_reason" text;--> statement-breakpoint
ALTER TABLE "tutor_tax_config" ADD CONSTRAINT "tutor_tax_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_prepared_by_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_reconciliation_resolved_by_user_id_fk" FOREIGN KEY ("reconciliation_resolved_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_idempotency_uniq" ON "tutor_payout" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "tutor_payout_status_paid_at_idx" ON "tutor_payout" USING btree ("status","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_allocation_source_active_uniq" ON "tutor_payout_allocation" USING btree ("source_key") WHERE "tutor_payout_allocation"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_payout_allocation_fee_active_uniq" ON "tutor_payout_allocation" USING btree ("tutor_session_fee_id") WHERE "tutor_payout_allocation"."tutor_session_fee_id" IS NOT NULL AND "tutor_payout_allocation"."active";--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_tax_nik_check" CHECK ("tutor_profile"."nik" IS NULL OR "tutor_profile"."nik" ~ '^[0-9]{16}$');--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_tax_rate_override_check" CHECK ("tutor_profile"."tax_rate_override_bps" IS NULL OR "tutor_profile"."tax_rate_override_bps" BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_tax_status_check" CHECK ("tutor_payout"."tax_status" IS NULL OR "tutor_payout"."tax_status" IN ('nik_npwp', 'nik_only', 'missing'));--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_tax_rate_source_check" CHECK ("tutor_payout"."tax_rate_source" IS NULL OR "tutor_payout"."tax_rate_source" IN ('default_nik_npwp', 'default_nik_only', 'default_missing', 'tutor_override'));--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_reconciliation_status_check" CHECK ("tutor_payout"."reconciliation_status" IN ('not_required', 'required', 'resolved'));--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_status_check" CHECK ("tutor_payout"."status" IN ('prepared', 'paid', 'void'));--> statement-breakpoint
ALTER TABLE "tutor_payout" ADD CONSTRAINT "tutor_payout_amounts_check" CHECK ("tutor_payout"."gross_honorarium_idr" >= 0 AND "tutor_payout"."transfer_fee_idr" >= 0 AND "tutor_payout"."net_honorarium_idr" >= 0 AND ("tutor_payout"."tax_honorarium_idr" IS NULL OR "tutor_payout"."tax_honorarium_idr" >= 0) AND ("tutor_payout"."actual_amount_idr" IS NULL OR "tutor_payout"."actual_amount_idr" >= 0));