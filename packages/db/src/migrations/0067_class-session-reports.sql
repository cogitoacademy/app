CREATE TABLE "academy_class_session_report" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"delivery_tutor_id" text NOT NULL,
	"current_actor_id" text NOT NULL,
	"current_actor_role" text NOT NULL,
	"admin_reason" text,
	"delivery_confirmed" boolean NOT NULL,
	"discussion" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_session_report_actor_role_check" CHECK ("academy_class_session_report"."current_actor_role" IN ('admin', 'tutor')),
	CONSTRAINT "academy_class_session_report_admin_reason_check" CHECK (("academy_class_session_report"."current_actor_role" = 'admin' AND length(trim(coalesce("academy_class_session_report"."admin_reason", ''))) > 0) OR ("academy_class_session_report"."current_actor_role" = 'tutor' AND "academy_class_session_report"."admin_reason" IS NULL)),
	CONSTRAINT "academy_class_session_report_delivery_confirmed_check" CHECK ("academy_class_session_report"."delivery_confirmed" IS TRUE),
	CONSTRAINT "academy_class_session_report_version_positive" CHECK ("academy_class_session_report"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "academy_class_session_report_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"version" integer NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"admin_reason" text,
	"request_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"delivery_confirmed" boolean NOT NULL,
	"discussion" jsonb NOT NULL,
	"strengths" jsonb NOT NULL,
	"improvements" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_session_report_revision_actor_role_check" CHECK ("academy_class_session_report_revision"."actor_role" IN ('admin', 'tutor')),
	CONSTRAINT "academy_class_session_report_revision_admin_reason_check" CHECK (("academy_class_session_report_revision"."actor_role" = 'admin' AND length(trim(coalesce("academy_class_session_report_revision"."admin_reason", ''))) > 0) OR ("academy_class_session_report_revision"."actor_role" = 'tutor' AND "academy_class_session_report_revision"."admin_reason" IS NULL)),
	CONSTRAINT "academy_class_session_report_revision_delivery_confirmed_check" CHECK ("academy_class_session_report_revision"."delivery_confirmed" IS TRUE),
	CONSTRAINT "academy_class_session_report_revision_version_positive" CHECK ("academy_class_session_report_revision"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" DROP CONSTRAINT "tutor_payout_allocation_booking_type_check";--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD COLUMN "academy_class_session_id" text;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD COLUMN "delivery_label" text;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD COLUMN "collected_marks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "academy_class_session_id" text;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "delivery_label" text;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD COLUMN "collected_marks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "academy_class_session_report" ADD CONSTRAINT "academy_class_session_report_session_id_academy_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session_report" ADD CONSTRAINT "academy_class_session_report_delivery_tutor_id_user_id_fk" FOREIGN KEY ("delivery_tutor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session_report" ADD CONSTRAINT "academy_class_session_report_current_actor_id_user_id_fk" FOREIGN KEY ("current_actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session_report_revision" ADD CONSTRAINT "academy_class_session_report_revision_report_id_academy_class_session_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."academy_class_session_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session_report_revision" ADD CONSTRAINT "academy_class_session_report_revision_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_session_report_session_uniq" ON "academy_class_session_report" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "academy_class_session_report_delivery_tutor_idx" ON "academy_class_session_report" USING btree ("delivery_tutor_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_session_report_revision_version_uniq" ON "academy_class_session_report_revision" USING btree ("report_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_session_report_revision_request_uniq" ON "academy_class_session_report_revision" USING btree ("report_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_session_report_revision_fingerprint_uniq" ON "academy_class_session_report_revision" USING btree ("report_id","fingerprint");--> statement-breakpoint
CREATE INDEX "academy_class_session_report_revision_created_idx" ON "academy_class_session_report_revision" USING btree ("report_id","created_at");--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_academy_class_session_id_academy_class_session_id_fk" FOREIGN KEY ("academy_class_session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_academy_class_session_id_academy_class_session_id_fk" FOREIGN KEY ("academy_class_session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_session_fee_class_session_uniq" ON "tutor_session_fee" USING btree ("academy_class_session_id") WHERE "tutor_session_fee"."academy_class_session_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_source_identity_check" CHECK (("tutor_session_fee"."booking_id" IS NOT NULL AND "tutor_session_fee"."academy_class_session_id" IS NULL) OR ("tutor_session_fee"."booking_id" IS NULL AND "tutor_session_fee"."booking_session_id" IS NULL AND "tutor_session_fee"."academy_class_session_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "tutor_session_fee" ADD CONSTRAINT "tutor_session_fee_collected_marks_nonnegative" CHECK ("tutor_session_fee"."collected_marks" >= 0);--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_source_identity_check" CHECK (("tutor_payout_allocation"."booking_id" IS NOT NULL AND "tutor_payout_allocation"."academy_class_session_id" IS NULL) OR ("tutor_payout_allocation"."booking_id" IS NULL AND "tutor_payout_allocation"."booking_session_id" IS NULL AND "tutor_payout_allocation"."academy_class_session_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_collected_marks_check" CHECK ("tutor_payout_allocation"."collected_marks" >= 0);--> statement-breakpoint
ALTER TABLE "tutor_payout_allocation" ADD CONSTRAINT "tutor_payout_allocation_booking_type_check" CHECK ("tutor_payout_allocation"."booking_type" IN ('solo','group','series','cohort','masterclass'));