-- X1: store the provider-side payment request id (Xendit `pr-...`) so
-- admin refunds can initiate a provider refund (POST /v3/refunds).
ALTER TABLE "payment_record" ADD COLUMN "provider_request_id" text;
