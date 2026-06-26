CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"modality" text NOT NULL,
	"tutor_id" text NOT NULL,
	"proposer_id" text NOT NULL,
	"target_group_size" integer NOT NULL,
	"min_confirmed_headcount" integer DEFAULT 1 NOT NULL,
	"confirmed_headcount" integer DEFAULT 0 NOT NULL,
	"current_state" text DEFAULT 'draft' NOT NULL,
	"previous_state" text,
	"state_reason" text,
	"deadline_at" timestamp with time zone,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"room_id" text,
	"price_snapshot" jsonb,
	"original_marks" integer NOT NULL,
	"repriced_marks" integer,
	"hold_amount" integer DEFAULT 0 NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"cancellation_reason" text,
	"reschedule_meta" jsonb,
	"override_meta" jsonb,
	"notification_flags" jsonb,
	"series_parent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_type_check" CHECK ("booking"."type" IN ('solo','group','series')),
	CONSTRAINT "booking_modality_check" CHECK ("booking"."modality" IN ('online','offline')),
	CONSTRAINT "booking_state_check" CHECK ("booking"."current_state" IN ('draft','awaiting_marks_hold','awaiting_tutor_review','awaiting_participant_confirmation','awaiting_reconfirmation','awaiting_admin_room_approval','confirmed','scheduled','completed','declined','cancelled','late_cancelled','no_show','expired','reschedule_proposed')),
	CONSTRAINT "booking_group_size_check" CHECK ("booking"."target_group_size" BETWEEN 1 AND 6),
	CONSTRAINT "booking_headcount_check" CHECK ("booking"."confirmed_headcount" BETWEEN 0 AND "booking"."target_group_size"),
	CONSTRAINT "booking_end_after_start" CHECK ("booking"."scheduled_end_at" > "booking"."scheduled_start_at")
);
--> statement-breakpoint
CREATE TABLE "booking_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"confirmation_state" text DEFAULT 'pending' NOT NULL,
	"held_amount" integer DEFAULT 0 NOT NULL,
	"held_ledger_id" text,
	"confirmed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"reconfirmed_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_reason" text,
	"attendance_state" text DEFAULT 'unknown',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_participant_role_check" CHECK ("booking_participant"."role" IN ('proposer','invitee')),
	CONSTRAINT "booking_participant_confirmation_check" CHECK ("booking_participant"."confirmation_state" IN ('pending','confirmed','declined','reconfirmed','withdrawn_pre_h2','withdrawn_post_h2','no_show')),
	CONSTRAINT "booking_participant_attendance_check" CHECK ("booking_participant"."attendance_state" IN ('present','late','absent','unknown'))
);
--> statement-breakpoint
CREATE TABLE "booking_reschedule_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"proposed_by" text NOT NULL,
	"proposed_start_at" timestamp with time zone NOT NULL,
	"proposed_end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "reschedule_status_check" CHECK ("booking_reschedule_proposal"."status" IN ('pending','accepted','rejected','expired'))
);
--> statement-breakpoint
CREATE TABLE "booking_state_history" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"reason" text,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_state_history_actor_check" CHECK ("booking_state_history"."actor_type" IN ('admin','tutor','student','system'))
);
--> statement-breakpoint
CREATE TABLE "meeting_event" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"provider" text DEFAULT 'pending' NOT NULL,
	"external_event_id" text,
	"meeting_url" text,
	"attendee_emails" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_reason" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_provider_check" CHECK ("meeting_event"."provider" IN ('google_meet','manual','pending')),
	CONSTRAINT "meeting_status_check" CHECK ("meeting_event"."status" IN ('pending','created','failed','manual','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "room" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"capacity" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "room_booking_status_check" CHECK ("room_booking"."status" IN ('requested','confirmed','relocated','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_proposer_id_user_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_held_ledger_id_wallet_id_fk" FOREIGN KEY ("held_ledger_id") REFERENCES "public"."wallet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "booking_reschedule_proposal_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "booking_reschedule_proposal_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_state_history" ADD CONSTRAINT "booking_state_history_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_state_history" ADD CONSTRAINT "booking_state_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_event" ADD CONSTRAINT "meeting_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_event" ADD CONSTRAINT "meeting_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_tutorId_state_idx" ON "booking" USING btree ("tutor_id","current_state");--> statement-breakpoint
CREATE INDEX "booking_proposerId_state_idx" ON "booking" USING btree ("proposer_id","current_state");--> statement-breakpoint
CREATE INDEX "booking_state_deadline_idx" ON "booking" USING btree ("current_state","deadline_at");--> statement-breakpoint
CREATE INDEX "booking_seriesParentId_idx" ON "booking" USING btree ("series_parent_id");--> statement-breakpoint
CREATE INDEX "booking_scheduledStartAt_idx" ON "booking" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "booking_participant_bookingId_idx" ON "booking_participant" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_participant_userId_state_idx" ON "booking_participant" USING btree ("user_id","confirmation_state");--> statement-breakpoint
CREATE INDEX "reschedule_bookingId_idx" ON "booking_reschedule_proposal" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_state_history_bookingId_idx" ON "booking_state_history" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_state_history_createdAt_idx" ON "booking_state_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meeting_event_bookingId_idx" ON "meeting_event" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "room_isActive_idx" ON "room" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "room_booking_roomId_idx" ON "room_booking" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_booking_bookingId_idx" ON "room_booking" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "room_booking_startAt_idx" ON "room_booking" USING btree ("start_at");