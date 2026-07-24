ALTER TABLE "booking" DROP COLUMN IF EXISTS "repriced_marks";

ALTER TABLE "booking" DROP CONSTRAINT IF EXISTS "booking_state_check";
ALTER TABLE "booking" ADD CONSTRAINT "booking_state_check" CHECK ("booking"."current_state" IN ('awaiting_tutor_review','declined','reschedule_proposed','awaiting_reconfirmation','awaiting_admin_room_approval','awaiting_participant_confirmation','confirmed','scheduled','completed','cancelled','late_cancelled','no_show','expired'));

ALTER TABLE "booking" ALTER COLUMN "current_state" SET DEFAULT 'awaiting_tutor_review';