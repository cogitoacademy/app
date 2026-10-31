CREATE TABLE "friend_reward_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"referred_user_id" text NOT NULL,
	"choice_id" text NOT NULL,
	"referrer_user_id" text NOT NULL,
	"completion_type" text NOT NULL,
	"completion_id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"semester_key" text NOT NULL,
	"reward_marks_snapshot" integer NOT NULL,
	"semester_cap_marks" integer NOT NULL,
	"credited_marks" integer NOT NULL,
	"ledger_entry_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friend_reward_completion_type_check" CHECK ("friend_reward_decision"."completion_type" IN ('solo', 'group', 'series_child', 'cohort', 'masterclass')),
	CONSTRAINT "friend_reward_amounts_nonnegative" CHECK ("friend_reward_decision"."reward_marks_snapshot" >= 0 AND "friend_reward_decision"."semester_cap_marks" >= 0 AND "friend_reward_decision"."credited_marks" >= 0 AND "friend_reward_decision"."credited_marks" <= "friend_reward_decision"."reward_marks_snapshot" AND "friend_reward_decision"."credited_marks" <= "friend_reward_decision"."semester_cap_marks")
);
--> statement-breakpoint
CREATE TABLE "referral_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"activation_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attribution_window_days" integer NOT NULL,
	"flat_amount_idr" integer DEFAULT 0 NOT NULL,
	"percent_bps" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_campaign_activation_before_expiry" CHECK ("referral_campaign"."expires_at" > "referral_campaign"."activation_at"),
	CONSTRAINT "referral_campaign_attribution_window_positive" CHECK ("referral_campaign"."attribution_window_days" > 0 AND "referral_campaign"."attribution_window_days" <= 365),
	CONSTRAINT "referral_campaign_terms_valid" CHECK ("referral_campaign"."flat_amount_idr" >= 0 AND "referral_campaign"."percent_bps" BETWEEN 0 AND 10000 AND ("referral_campaign"."flat_amount_idr" > 0 OR "referral_campaign"."percent_bps" > 0))
);
--> statement-breakpoint
CREATE TABLE "referral_choice" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"code_id" text,
	"code_snapshot" text,
	"referrer_user_id" text,
	"campaign_id" text,
	"welcome_marks_snapshot" integer NOT NULL,
	"friend_reward_marks_snapshot" integer,
	"kol_flat_amount_idr_snapshot" integer,
	"kol_percent_bps_snapshot" integer,
	"kol_attribution_expires_at" timestamp with time zone,
	"settings_version" integer NOT NULL,
	"welcome_ledger_entry_id" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_choice_snapshot_valid" CHECK (("referral_choice"."kind" = 'none' AND "referral_choice"."code_id" IS NULL AND "referral_choice"."code_snapshot" IS NULL AND "referral_choice"."referrer_user_id" IS NULL AND "referral_choice"."campaign_id" IS NULL AND "referral_choice"."welcome_marks_snapshot" = 0 AND "referral_choice"."friend_reward_marks_snapshot" IS NULL AND "referral_choice"."kol_flat_amount_idr_snapshot" IS NULL AND "referral_choice"."kol_percent_bps_snapshot" IS NULL AND "referral_choice"."kol_attribution_expires_at" IS NULL) OR ("referral_choice"."kind" = 'friend' AND "referral_choice"."code_id" IS NOT NULL AND "referral_choice"."code_snapshot" IS NOT NULL AND "referral_choice"."referrer_user_id" IS NOT NULL AND "referral_choice"."campaign_id" IS NULL AND "referral_choice"."welcome_marks_snapshot" >= 0 AND "referral_choice"."friend_reward_marks_snapshot" IS NOT NULL AND "referral_choice"."friend_reward_marks_snapshot" >= 0 AND "referral_choice"."kol_flat_amount_idr_snapshot" IS NULL AND "referral_choice"."kol_percent_bps_snapshot" IS NULL AND "referral_choice"."kol_attribution_expires_at" IS NULL) OR ("referral_choice"."kind" = 'kol' AND "referral_choice"."code_id" IS NOT NULL AND "referral_choice"."code_snapshot" IS NOT NULL AND "referral_choice"."referrer_user_id" IS NULL AND "referral_choice"."campaign_id" IS NOT NULL AND "referral_choice"."welcome_marks_snapshot" >= 0 AND "referral_choice"."friend_reward_marks_snapshot" IS NULL AND "referral_choice"."kol_flat_amount_idr_snapshot" IS NOT NULL AND "referral_choice"."kol_flat_amount_idr_snapshot" >= 0 AND "referral_choice"."kol_percent_bps_snapshot" IS NOT NULL AND "referral_choice"."kol_percent_bps_snapshot" BETWEEN 0 AND 10000 AND "referral_choice"."kol_attribution_expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "referral_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"referrer_user_id" text,
	"campaign_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_code_format" CHECK ("referral_code"."code" = upper("referral_code"."code") AND "referral_code"."code" ~ '^[A-Z0-9]{4,32}$'),
	CONSTRAINT "referral_code_kind_owner" CHECK (("referral_code"."kind" = 'friend' AND "referral_code"."referrer_user_id" IS NOT NULL AND "referral_code"."campaign_id" IS NULL) OR ("referral_code"."kind" = 'kol' AND "referral_code"."referrer_user_id" IS NULL AND "referral_code"."campaign_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "referral_semester_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"referrer_user_id" text NOT NULL,
	"semester_key" text NOT NULL,
	"credited_marks" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_semester_usage_nonnegative" CHECK ("referral_semester_usage"."credited_marks" >= 0)
);
--> statement-breakpoint
CREATE TABLE "referral_settings_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"welcome_marks" integer NOT NULL,
	"friend_reward_marks" integer NOT NULL,
	"semester_cap_marks" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"changed_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_settings_version_positive" CHECK ("referral_settings_revision"."version" > 0),
	CONSTRAINT "referral_settings_marks_nonnegative" CHECK ("referral_settings_revision"."welcome_marks" >= 0 AND "referral_settings_revision"."friend_reward_marks" >= 0 AND "referral_settings_revision"."semester_cap_marks" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "referral_choice_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "friend_reward_decision" ADD CONSTRAINT "friend_reward_decision_referred_user_id_user_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_reward_decision" ADD CONSTRAINT "friend_reward_decision_choice_id_referral_choice_id_fk" FOREIGN KEY ("choice_id") REFERENCES "public"."referral_choice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_reward_decision" ADD CONSTRAINT "friend_reward_decision_referrer_user_id_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_reward_decision" ADD CONSTRAINT "friend_reward_decision_ledger_entry_id_ledger_entry_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_campaign" ADD CONSTRAINT "referral_campaign_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_choice" ADD CONSTRAINT "referral_choice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_choice" ADD CONSTRAINT "referral_choice_code_id_referral_code_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."referral_code"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_choice" ADD CONSTRAINT "referral_choice_referrer_user_id_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_choice" ADD CONSTRAINT "referral_choice_campaign_id_referral_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_choice" ADD CONSTRAINT "referral_choice_welcome_ledger_entry_id_ledger_entry_id_fk" FOREIGN KEY ("welcome_ledger_entry_id") REFERENCES "public"."ledger_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_code" ADD CONSTRAINT "referral_code_referrer_user_id_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_code" ADD CONSTRAINT "referral_code_campaign_id_referral_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."referral_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_semester_usage" ADD CONSTRAINT "referral_semester_usage_referrer_user_id_user_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_settings_revision" ADD CONSTRAINT "referral_settings_revision_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_reward_referred_user_uniq" ON "friend_reward_decision" USING btree ("referred_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_reward_choice_uniq" ON "friend_reward_decision" USING btree ("choice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_reward_completion_student_uniq" ON "friend_reward_decision" USING btree ("completion_type","completion_id","referred_user_id");--> statement-breakpoint
CREATE INDEX "friend_reward_referrer_semester_idx" ON "friend_reward_decision" USING btree ("referrer_user_id","semester_key");--> statement-breakpoint
CREATE INDEX "referral_campaign_expiry_idx" ON "referral_campaign" USING btree ("activation_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_choice_user_uniq" ON "referral_choice" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_choice_welcome_ledger_uniq" ON "referral_choice" USING btree ("welcome_ledger_entry_id") WHERE "referral_choice"."welcome_ledger_entry_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "referral_choice_referrer_idx" ON "referral_choice" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referral_choice_campaign_idx" ON "referral_choice" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_code_value_uniq" ON "referral_code" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_code_friend_owner_uniq" ON "referral_code" USING btree ("referrer_user_id") WHERE "referral_code"."referrer_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_code_campaign_uniq" ON "referral_code" USING btree ("campaign_id") WHERE "referral_code"."campaign_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_semester_usage_owner_semester_uniq" ON "referral_semester_usage" USING btree ("referrer_user_id","semester_key");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_settings_version_uniq" ON "referral_settings_revision" USING btree ("version");--> statement-breakpoint
CREATE INDEX "referral_settings_effective_idx" ON "referral_settings_revision" USING btree ("effective_at");