ALTER TABLE "payment_record" DROP CONSTRAINT "payment_status_check";--> statement-breakpoint
ALTER TABLE "payment_record" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_status_check" CHECK ("payment_record"."status" IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED'));--> statement-breakpoint
UPDATE "payment_record" SET status = 'PAID' WHERE status = 'succeeded';--> statement-breakpoint
UPDATE "payment_record" SET status = 'FAILED' WHERE status = 'failed';--> statement-breakpoint
UPDATE "payment_record" SET status = 'PENDING' WHERE status = 'pending';--> statement-breakpoint
UPDATE "payment_record" SET status = 'REFUNDED' WHERE status = 'refunded';