-- Reject obsolete report provenance and payout sources without rewriting history.
ALTER TABLE "session_completion_feedback_history"
  DROP CONSTRAINT "session_feedback_history_status_check",
  DROP CONSTRAINT "session_feedback_history_actor_check",
  ADD CONSTRAINT "session_feedback_history_status_check"
    CHECK ("status" IN ('submitted','corrected')),
  ADD CONSTRAINT "session_feedback_history_actor_check"
    CHECK ("actor_role" IN ('admin','tutor'));
--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation"
  DROP CONSTRAINT "tutor_payout_allocation_source_type_check",
  ADD CONSTRAINT "tutor_payout_allocation_source_type_check"
    CHECK ("source_type" = 'fee_event'),
  ALTER COLUMN "tutor_session_fee_id" SET NOT NULL;
