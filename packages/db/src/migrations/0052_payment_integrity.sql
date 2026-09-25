ALTER TABLE "payment_record" DROP CONSTRAINT "payment_provider_check";--> statement-breakpoint
DROP INDEX "wallet_userId_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notification_eventKey_idx";--> statement-breakpoint
CREATE INDEX "payment_reconciliation_idx" ON "payment_record" USING btree ("provider","status","updated_at") WHERE "payment_record"."provider_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_latest_attempt_idx" ON "payment_record" USING btree ("user_id","package_id","provider","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_total_nonnegative" CHECK ("wallet"."total_balance" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_held_nonnegative" CHECK ("wallet"."held_balance" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_available_nonnegative" CHECK ("wallet"."available_balance" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_amount_positive" CHECK ("payment_record"."amount_idr" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_marks_positive" CHECK ("payment_record"."marks" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_provider_check" CHECK ("payment_record"."provider" IN ('stub','midtrans','xendit'));--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_amount_nonnegative" CHECK ("refund_record"."amount_idr" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_marks_nonnegative" CHECK ("refund_record"."marks" >= 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payment_record" VALIDATE CONSTRAINT "payment_amount_positive";--> statement-breakpoint
ALTER TABLE "payment_record" VALIDATE CONSTRAINT "payment_marks_positive";--> statement-breakpoint
ALTER TABLE "refund_record" VALIDATE CONSTRAINT "refund_amount_nonnegative";--> statement-breakpoint
ALTER TABLE "refund_record" VALIDATE CONSTRAINT "refund_marks_nonnegative";--> statement-breakpoint
ALTER TABLE "wallet" VALIDATE CONSTRAINT "wallet_total_nonnegative";--> statement-breakpoint
ALTER TABLE "wallet" VALIDATE CONSTRAINT "wallet_held_nonnegative";--> statement-breakpoint
ALTER TABLE "wallet" VALIDATE CONSTRAINT "wallet_available_nonnegative";
