-- Allow the outbox 'sending' claim state (BACKEND-REVIEW-HARDENING M14).
ALTER TABLE "notification_dispatch" DROP CONSTRAINT "dispatch_status_check";
ALTER TABLE "notification_dispatch" ADD CONSTRAINT "dispatch_status_check" CHECK ("notification_dispatch"."status" IN ('queued', 'sending', 'sent', 'failed', 'suppressed'));
