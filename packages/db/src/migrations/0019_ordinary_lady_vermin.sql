-- B6: the provider reference is the payment idempotency key — make it unique
-- so concurrent check-then-insert races cannot create zombie PENDING rows.
DROP INDEX "payment_providerReference_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_reference_idx" ON "payment_record" USING btree ("provider_reference");
