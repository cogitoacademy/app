-- Restore 'expired' to the reschedule-proposal status check: 0020 dropped it
-- when 'superseded' was introduced, but the booking schema and the
-- expireBookings RESCHEDULE_PROPOSED path both rely on 'expired'.
ALTER TABLE "booking_reschedule_proposal" DROP CONSTRAINT "reschedule_status_check";
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "reschedule_status_check" CHECK ("booking_reschedule_proposal"."status" IN ('pending','accepted','rejected','expired','superseded'));