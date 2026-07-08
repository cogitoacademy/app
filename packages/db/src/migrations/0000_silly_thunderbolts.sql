CREATE TABLE "achievement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_name" text NOT NULL,
	"category" text NOT NULL,
	"award" text NOT NULL,
	"level" text NOT NULL,
	"event_date" date,
	"location" text,
	"description" text,
	"subjects" jsonb DEFAULT '[]'::jsonb,
	"image_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_status_check" CHECK ("achievement"."status" IN ('draft', 'pending', 'pending_review', 'approved', 'rejected', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"target_type" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_type_check" CHECK ("audit_log"."actor_type" IN ('admin', 'tutor', 'student', 'system'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'student' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" IN ('student', 'tutor', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slot" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_id" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"modality" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "availability_slot_modality_check" CHECK ("availability_slot"."modality" IN ('online','offline','both'))
);
--> statement-breakpoint
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
CREATE TABLE "booking_session" (
	"id" text PRIMARY KEY NOT NULL,
	"series_booking_id" text NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"current_state" text DEFAULT 'scheduled' NOT NULL,
	"hold_amount" integer DEFAULT 0 NOT NULL,
	"price_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_session_state_check" CHECK ("booking_session"."current_state" IN ('scheduled','completed','cancelled','no_show','late_cancelled'))
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
CREATE TABLE "student_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"phone_number" text,
	"school_name" text,
	"grade_level" text,
	"parent_name" text,
	"parent_phone" text,
	"parent_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"booking_id" text,
	"event_key" text NOT NULL,
	"entry_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"amount" integer NOT NULL,
	"before_balance" integer NOT NULL,
	"after_balance" integer NOT NULL,
	"balance_after_wallet_total" integer,
	"balance_after_wallet_held" integer,
	"reason" text,
	"source_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_type_check" CHECK ("ledger_entry"."entry_type" IN ('credit', 'hold', 'release', 'deduct', 'compensate_credit', 'compensate_deduct')),
	CONSTRAINT "ledger_amount_positive" CHECK ("ledger_entry"."amount" > 0),
	CONSTRAINT "ledger_actor_type_check" CHECK ("ledger_entry"."actor_type" IN ('admin', 'tutor', 'student', 'system'))
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"total_balance" integer DEFAULT 0 NOT NULL,
	"held_balance" integer DEFAULT 0 NOT NULL,
	"available_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "wallet_balance_invariant" CHECK ("wallet"."total_balance" = "wallet"."held_balance" + "wallet"."available_balance")
);
--> statement-breakpoint
CREATE TABLE "tutor_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" text NOT NULL,
	"accepted_by" text,
	"revoked_by" text,
	"revoked_at" timestamp,
	"internal_notes" text,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_invite_token_unique" UNIQUE("token"),
	CONSTRAINT "tutor_invite_status_check" CHECK ("tutor_invite"."status" IN ('invited', 'accepted', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "tutor_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"invite_id" text NOT NULL,
	"display_name" text,
	"short_bio" text,
	"credentials_summary" text,
	"expertise" jsonb DEFAULT '[]'::jsonb,
	"modality" text,
	"prices" jsonb,
	"availability_summary" text,
	"proof_urls" jsonb DEFAULT '[]'::jsonb,
	"onboarding_status" text DEFAULT 'draft' NOT NULL,
	"admin_review_note" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_profile_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "tutor_profile_modality_check" CHECK ("tutor_profile"."modality" IS NULL OR "tutor_profile"."modality" IN ('online', 'offline', 'both')),
	CONSTRAINT "tutor_profile_onboarding_status_check" CHECK ("tutor_profile"."onboarding_status" IN ('draft', 'pending_review', 'changes_requested', 'approved_unpublished', 'published', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "mark_package" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"marks" integer NOT NULL,
	"price_idr" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mark_package_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_record" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"package_id" text,
	"provider" text NOT NULL,
	"provider_reference" text NOT NULL,
	"provider_event_id" text,
	"amount_idr" integer NOT NULL,
	"marks" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"receipt_url" text,
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_provider_check" CHECK ("payment_record"."provider" IN ('stub','midtrans','xendit')),
	CONSTRAINT "payment_status_check" CHECK ("payment_record"."status" IN ('PENDING','PAID','SETTLED','FAILED','EXPIRED','REFUNDED'))
);
--> statement-breakpoint
CREATE TABLE "refund_record" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"provider_reference" text,
	"provider_event_id" text,
	"amount_idr" integer NOT NULL,
	"marks" integer NOT NULL,
	"reason" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"event_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_category_check" CHECK ("notification"."category" IN ('booking','payment','refund','schedule','achievement','system','override')),
	CONSTRAINT "notification_severity_check" CHECK ("notification"."severity" IN ('info','action','critical'))
);
--> statement-breakpoint
CREATE TABLE "notification_dispatch" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_email" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "dispatch_channel_check" CHECK ("notification_dispatch"."channel" IN ('email')),
	CONSTRAINT "dispatch_status_check" CHECK ("notification_dispatch"."status" IN ('queued','sent','failed','suppressed'))
);
--> statement-breakpoint
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_proposer_id_user_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_participant" ADD CONSTRAINT "booking_participant_held_ledger_id_wallet_id_fk" FOREIGN KEY ("held_ledger_id") REFERENCES "public"."wallet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "booking_reschedule_proposal_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reschedule_proposal" ADD CONSTRAINT "booking_reschedule_proposal_proposed_by_user_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_session" ADD CONSTRAINT "booking_session_series_booking_id_booking_id_fk" FOREIGN KEY ("series_booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_state_history" ADD CONSTRAINT "booking_state_history_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_state_history" ADD CONSTRAINT "booking_state_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_event" ADD CONSTRAINT "meeting_event_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_event" ADD CONSTRAINT "meeting_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_invite_id_tutor_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."tutor_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_record" ADD CONSTRAINT "payment_record_package_id_mark_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."mark_package"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_payment_id_payment_record_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_record"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_dispatch" ADD CONSTRAINT "notification_dispatch_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_userId_idx" ON "achievement" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achievement_status_idx" ON "achievement" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_actorId_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "availability_slot_tutorId_startDate_idx" ON "availability_slot" USING btree ("tutor_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_slot_unique_idx" ON "availability_slot" USING btree ("tutor_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "booking_tutorId_state_idx" ON "booking" USING btree ("tutor_id","current_state");--> statement-breakpoint
CREATE INDEX "booking_proposerId_state_idx" ON "booking" USING btree ("proposer_id","current_state");--> statement-breakpoint
CREATE INDEX "booking_state_deadline_idx" ON "booking" USING btree ("current_state","deadline_at");--> statement-breakpoint
CREATE INDEX "booking_seriesParentId_idx" ON "booking" USING btree ("series_parent_id");--> statement-breakpoint
CREATE INDEX "booking_scheduledStartAt_idx" ON "booking" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "booking_participant_bookingId_idx" ON "booking_participant" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_participant_userId_state_idx" ON "booking_participant" USING btree ("user_id","confirmation_state");--> statement-breakpoint
CREATE INDEX "reschedule_bookingId_idx" ON "booking_reschedule_proposal" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_session_seriesBookingId_idx" ON "booking_session" USING btree ("series_booking_id");--> statement-breakpoint
CREATE INDEX "booking_session_scheduledStartAt_idx" ON "booking_session" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "booking_state_history_bookingId_idx" ON "booking_state_history" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_state_history_createdAt_idx" ON "booking_state_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "meeting_event_bookingId_idx" ON "meeting_event" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "room_isActive_idx" ON "room" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "room_booking_roomId_idx" ON "room_booking" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "room_booking_bookingId_idx" ON "room_booking" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "room_booking_startAt_idx" ON "room_booking" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "student_profile_userId_idx" ON "student_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_walletId_idx" ON "ledger_entry" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "ledger_eventKey_idx" ON "ledger_entry" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "ledger_bookingId_idx" ON "ledger_entry" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_idempotency_idx" ON "ledger_entry" USING btree ("wallet_id","event_key","source_reference");--> statement-breakpoint
CREATE INDEX "wallet_userId_idx" ON "wallet" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tutor_invite_email_idx" ON "tutor_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "tutor_invite_token_idx" ON "tutor_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "tutor_invite_status_idx" ON "tutor_invite" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tutor_invite_invitedBy_idx" ON "tutor_invite" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "tutor_profile_userId_idx" ON "tutor_profile" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tutor_profile_onboardingStatus_idx" ON "tutor_profile" USING btree ("onboarding_status");--> statement-breakpoint
CREATE INDEX "tutor_profile_inviteId_idx" ON "tutor_profile" USING btree ("invite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_event_id_idx" ON "payment_record" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_userId_idx" ON "payment_record" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_providerReference_idx" ON "payment_record" USING btree ("provider_reference");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment_record" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_provider_event_id_idx" ON "refund_record" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "refund_paymentId_idx" ON "refund_record" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "notification_userId_read_created_idx" ON "notification" USING btree ("user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "notification_eventKey_idx" ON "notification" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "dispatch_notificationId_idx" ON "notification_dispatch" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "dispatch_status_idx" ON "notification_dispatch" USING btree ("status");