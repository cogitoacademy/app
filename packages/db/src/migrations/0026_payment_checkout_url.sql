-- H4: persist the provider checkout URL so a PENDING re-purchase returns the
-- stored URL instead of re-calling the provider (TODO H14 in payment.service).
ALTER TABLE "payment_record" ADD COLUMN "checkout_url" text;
