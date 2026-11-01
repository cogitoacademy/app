CREATE TABLE "academy_class_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"student_id" text NOT NULL,
	"request_key" text NOT NULL,
	"plan" text NOT NULL,
	"state" text DEFAULT 'checkout_pending' NOT NULL,
	"session_count" integer NOT NULL,
	"first_rate_marks" integer NOT NULL,
	"second_rate_marks" integer,
	"first_installment_marks" integer NOT NULL,
	"second_installment_marks" integer NOT NULL,
	"total_marks" integer NOT NULL,
	"checkout_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_enrollment_plan_check" CHECK ("academy_class_enrollment"."plan" IN ('full', 'half', 'single', 'masterclass')),
	CONSTRAINT "academy_class_enrollment_state_check" CHECK ("academy_class_enrollment"."state" IN ('checkout_pending', 'active', 'expired', 'cancelled')),
	CONSTRAINT "academy_class_enrollment_session_count_positive" CHECK ("academy_class_enrollment"."session_count" > 0),
	CONSTRAINT "academy_class_enrollment_first_rate_positive" CHECK ("academy_class_enrollment"."first_rate_marks" > 0),
	CONSTRAINT "academy_class_enrollment_second_rate_positive" CHECK ("academy_class_enrollment"."second_rate_marks" IS NULL OR "academy_class_enrollment"."second_rate_marks" > 0),
	CONSTRAINT "academy_class_enrollment_amounts_positive" CHECK ("academy_class_enrollment"."first_installment_marks" > 0 AND "academy_class_enrollment"."second_installment_marks" >= 0 AND "academy_class_enrollment"."total_marks" = "academy_class_enrollment"."first_installment_marks" + "academy_class_enrollment"."second_installment_marks"),
	CONSTRAINT "academy_class_enrollment_request_key_required" CHECK (length(trim("academy_class_enrollment"."request_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "academy_class_enrollment_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"installment_id" text NOT NULL,
	"class_id" text NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"rate_marks" integer NOT NULL,
	"state" text NOT NULL,
	"funding_event_key" text NOT NULL,
	"funding_source_reference" text NOT NULL,
	"funded_marks" integer DEFAULT 0 NOT NULL,
	"spent_marks" integer DEFAULT 0 NOT NULL,
	"released_marks" integer DEFAULT 0 NOT NULL,
	"funded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_enrollment_allocation_ordinal_positive" CHECK ("academy_class_enrollment_allocation"."ordinal" > 0 AND "academy_class_enrollment_allocation"."sequence_number" > 0),
	CONSTRAINT "academy_class_enrollment_allocation_rate_positive" CHECK ("academy_class_enrollment_allocation"."rate_marks" > 0),
	CONSTRAINT "academy_class_enrollment_allocation_state_check" CHECK ("academy_class_enrollment_allocation"."state" IN ('checkout_reserved', 'unfunded_reserved', 'funded', 'released')),
	CONSTRAINT "academy_class_enrollment_allocation_marks_check" CHECK ("academy_class_enrollment_allocation"."funded_marks" >= 0 AND "academy_class_enrollment_allocation"."funded_marks" <= "academy_class_enrollment_allocation"."rate_marks" AND "academy_class_enrollment_allocation"."spent_marks" >= 0 AND "academy_class_enrollment_allocation"."released_marks" >= 0 AND "academy_class_enrollment_allocation"."spent_marks" + "academy_class_enrollment_allocation"."released_marks" <= "academy_class_enrollment_allocation"."funded_marks"),
	CONSTRAINT "academy_class_enrollment_allocation_funding_state_check" CHECK (("academy_class_enrollment_allocation"."state" = 'funded' AND "academy_class_enrollment_allocation"."funded_marks" = "academy_class_enrollment_allocation"."rate_marks" AND "academy_class_enrollment_allocation"."funded_at" IS NOT NULL) OR ("academy_class_enrollment_allocation"."state" IN ('checkout_reserved', 'unfunded_reserved') AND "academy_class_enrollment_allocation"."funded_marks" = 0 AND "academy_class_enrollment_allocation"."funded_at" IS NULL AND "academy_class_enrollment_allocation"."spent_marks" = 0 AND "academy_class_enrollment_allocation"."released_marks" = 0) OR "academy_class_enrollment_allocation"."state" = 'released')
);
--> statement-breakpoint
CREATE TABLE "academy_class_enrollment_installment" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"rate_marks" integer NOT NULL,
	"session_count" integer NOT NULL,
	"amount_marks" integer NOT NULL,
	"state" text NOT NULL,
	"due_session_id" text,
	"due_at" timestamp with time zone,
	"checkout_expires_at" timestamp with time zone,
	"reminder_7d_processed_at" timestamp with time zone,
	"reminder_7d_for_at" timestamp with time zone,
	"reminder_1d_processed_at" timestamp with time zone,
	"reminder_1d_for_at" timestamp with time zone,
	"funded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_enrollment_installment_ordinal_check" CHECK ("academy_class_enrollment_installment"."ordinal" IN (1, 2)),
	CONSTRAINT "academy_class_enrollment_installment_rate_positive" CHECK ("academy_class_enrollment_installment"."rate_marks" > 0),
	CONSTRAINT "academy_class_enrollment_installment_count_positive" CHECK ("academy_class_enrollment_installment"."session_count" > 0),
	CONSTRAINT "academy_class_enrollment_installment_amount_positive" CHECK ("academy_class_enrollment_installment"."amount_marks" > 0 AND "academy_class_enrollment_installment"."amount_marks" = "academy_class_enrollment_installment"."rate_marks" * "academy_class_enrollment_installment"."session_count"),
	CONSTRAINT "academy_class_enrollment_installment_state_check" CHECK ("academy_class_enrollment_installment"."state" IN ('checkout_pending', 'pending', 'funded', 'defaulted', 'expired', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "academy_class_enrollment_top_up_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"installment_id" text NOT NULL,
	"request_key" text NOT NULL,
	"requested_marks" integer NOT NULL,
	"choice" text,
	"quote_id" text,
	"payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_enrollment_topup_marks_positive" CHECK ("academy_class_enrollment_top_up_attempt"."requested_marks" > 0),
	CONSTRAINT "academy_class_enrollment_topup_choice_check" CHECK ("academy_class_enrollment_top_up_attempt"."choice" IS NULL OR "academy_class_enrollment_top_up_attempt"."choice" IN ('package', 'custom', 'recommended'))
);
--> statement-breakpoint
ALTER TABLE "academy_class_enrollment" ADD CONSTRAINT "academy_class_enrollment_class_id_academy_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."academy_class"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment" ADD CONSTRAINT "academy_class_enrollment_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_allocation" ADD CONSTRAINT "academy_class_enrollment_allocation_enrollment_id_academy_class_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."academy_class_enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_allocation" ADD CONSTRAINT "academy_class_enrollment_allocation_installment_id_academy_class_enrollment_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."academy_class_enrollment_installment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_allocation" ADD CONSTRAINT "academy_class_enrollment_allocation_class_id_academy_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."academy_class"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_allocation" ADD CONSTRAINT "academy_class_enrollment_allocation_session_id_academy_class_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_allocation" ADD CONSTRAINT "academy_class_enrollment_allocation_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_installment" ADD CONSTRAINT "academy_class_enrollment_installment_enrollment_id_academy_class_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."academy_class_enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_installment" ADD CONSTRAINT "academy_class_enrollment_installment_due_session_id_academy_class_session_id_fk" FOREIGN KEY ("due_session_id") REFERENCES "public"."academy_class_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_top_up_attempt" ADD CONSTRAINT "academy_class_enrollment_top_up_attempt_installment_id_academy_class_enrollment_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."academy_class_enrollment_installment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_top_up_attempt" ADD CONSTRAINT "academy_class_enrollment_top_up_attempt_quote_id_economy_v3_top_up_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."economy_v3_top_up_quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_enrollment_top_up_attempt" ADD CONSTRAINT "academy_class_enrollment_top_up_attempt_payment_id_payment_record_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_record"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_student_request_uniq" ON "academy_class_enrollment" USING btree ("student_id","request_key");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_student_state_idx" ON "academy_class_enrollment" USING btree ("student_id","state");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_class_idx" ON "academy_class_enrollment" USING btree ("class_id","created_at");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_checkout_expiry_idx" ON "academy_class_enrollment" USING btree ("checkout_expires_at") WHERE "academy_class_enrollment"."state" = 'checkout_pending';--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_allocation_session_uniq" ON "academy_class_enrollment_allocation" USING btree ("enrollment_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_allocation_ordinal_uniq" ON "academy_class_enrollment_allocation" USING btree ("enrollment_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_allocation_funding_key_uniq" ON "academy_class_enrollment_allocation" USING btree ("funding_event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_allocation_student_session_active_uniq" ON "academy_class_enrollment_allocation" USING btree ("student_id","session_id") WHERE "academy_class_enrollment_allocation"."state" IN ('checkout_reserved', 'unfunded_reserved', 'funded');--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_allocation_session_state_idx" ON "academy_class_enrollment_allocation" USING btree ("session_id","state");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_allocation_student_idx" ON "academy_class_enrollment_allocation" USING btree ("student_id","class_id","state");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_allocation_installment_idx" ON "academy_class_enrollment_allocation" USING btree ("installment_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_installment_ordinal_uniq" ON "academy_class_enrollment_installment" USING btree ("enrollment_id","ordinal");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_installment_due_idx" ON "academy_class_enrollment_installment" USING btree ("state","due_at") WHERE "academy_class_enrollment_installment"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_installment_checkout_expiry_idx" ON "academy_class_enrollment_installment" USING btree ("checkout_expires_at") WHERE "academy_class_enrollment_installment"."state" = 'checkout_pending';--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_topup_request_key_uniq" ON "academy_class_enrollment_top_up_attempt" USING btree ("installment_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_topup_quote_uniq" ON "academy_class_enrollment_top_up_attempt" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_enrollment_topup_payment_uniq" ON "academy_class_enrollment_top_up_attempt" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "academy_class_enrollment_topup_latest_idx" ON "academy_class_enrollment_top_up_attempt" USING btree ("installment_id","created_at");