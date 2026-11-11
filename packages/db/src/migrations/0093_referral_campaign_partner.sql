ALTER TABLE "referral_campaign" DROP CONSTRAINT "referral_campaign_terms_valid";--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "campaign_type" text DEFAULT 'kol' NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "partner_name" text;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "bank_account_number" text;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "bank_account_holder_name" text;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD CONSTRAINT "referral_campaign_type_valid" CHECK ("referral_campaign"."campaign_type" IN ('internal', 'kol'));--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD CONSTRAINT "referral_campaign_terms_valid" CHECK ("referral_campaign"."flat_amount_idr" >= 0 AND "referral_campaign"."percent_bps" BETWEEN 0 AND 10000 AND ("referral_campaign"."campaign_type" = 'internal' OR "referral_campaign"."flat_amount_idr" > 0 OR "referral_campaign"."percent_bps" > 0));