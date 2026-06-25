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
	CONSTRAINT "user_email_unique" UNIQUE("email")
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
ALTER TABLE "achievement" ADD CONSTRAINT "achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profile" ADD CONSTRAINT "student_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_invite" ADD CONSTRAINT "tutor_invite_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profile" ADD CONSTRAINT "tutor_profile_invite_id_tutor_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."tutor_invite"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_userId_idx" ON "achievement" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achievement_status_idx" ON "achievement" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_actorId_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
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
CREATE INDEX "tutor_profile_inviteId_idx" ON "tutor_profile" USING btree ("invite_id");