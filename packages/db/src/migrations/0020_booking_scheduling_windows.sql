-- Fixed-duration scheduling and iterative, per-session reschedule proposals.
ALTER TABLE "booking" ADD COLUMN "learning_goal" text DEFAULT '' NOT NULL;

ALTER TABLE "booking_reschedule_proposal" ADD COLUMN "session_id" text;
ALTER TABLE "booking_reschedule_proposal" ADD COLUMN "reason" text;
ALTER TABLE "booking_reschedule_proposal" ADD COLUMN "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours');
ALTER TABLE "booking_reschedule_proposal" ADD COLUMN "decisions" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "booking_reschedule_proposal" DROP CONSTRAINT "reschedule_status_check";
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "reschedule_status_check" CHECK ("booking_reschedule_proposal"."status" IN ('pending','accepted','rejected','superseded'));
CREATE INDEX "booking_reschedule_session_idx" ON "booking_reschedule_proposal" USING btree ("session_id");
