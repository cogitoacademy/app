ALTER TABLE "booking_participant" DROP CONSTRAINT "booking_participant_held_ledger_id_wallet_id_fk";
--> statement-breakpoint
ALTER TABLE "meeting_event" DROP CONSTRAINT "meeting_event_created_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "booking_seriesParentId_idx";--> statement-breakpoint
ALTER TABLE "booking" DROP COLUMN "reschedule_meta";--> statement-breakpoint
ALTER TABLE "booking" DROP COLUMN "notification_flags";--> statement-breakpoint
ALTER TABLE "booking" DROP COLUMN "series_parent_id";--> statement-breakpoint
ALTER TABLE "booking_participant" DROP COLUMN "held_ledger_id";--> statement-breakpoint
ALTER TABLE "meeting_event" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "notification_dispatch" DROP COLUMN "provider_message_id";--> statement-breakpoint
ALTER TABLE "notification_dispatch" DROP COLUMN "sent_at";