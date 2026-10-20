CREATE TABLE "academy_class" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"competition_id" text NOT NULL,
	"title_en" text NOT NULL,
	"title_id" text,
	"description_en" text NOT NULL,
	"description_id" text,
	"cover_key" text,
	"minimum_enrollment" integer,
	"minimum_check_at" timestamp with time zone,
	"cohort_full_rate_marks" integer,
	"cohort_half_rate_marks" integer,
	"cohort_single_rate_marks" integer,
	"masterclass_rate_marks" integer,
	"tutor_fee_idr" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"postponement_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_kind_check" CHECK ("academy_class"."kind" IN ('cohort', 'masterclass')),
	CONSTRAINT "academy_class_state_check" CHECK ("academy_class"."state" IN ('draft', 'published', 'postponed', 'cancelled', 'completed')),
	CONSTRAINT "academy_class_tutor_fee_positive" CHECK ("academy_class"."tutor_fee_idr" > 0),
	CONSTRAINT "academy_class_postponement_count_check" CHECK ("academy_class"."postponement_count" BETWEEN 0 AND 1),
	CONSTRAINT "academy_class_version_positive" CHECK ("academy_class"."version" > 0),
	CONSTRAINT "academy_class_rate_shape_check" CHECK (("academy_class"."kind" = 'cohort' AND "academy_class"."cohort_full_rate_marks" IS NOT NULL AND "academy_class"."cohort_full_rate_marks" > 0 AND "academy_class"."cohort_half_rate_marks" IS NOT NULL AND "academy_class"."cohort_half_rate_marks" > 0 AND "academy_class"."cohort_single_rate_marks" IS NOT NULL AND "academy_class"."cohort_single_rate_marks" > 0 AND "academy_class"."masterclass_rate_marks" IS NULL AND "academy_class"."minimum_enrollment" IS NOT NULL AND "academy_class"."minimum_enrollment" > 0 AND "academy_class"."minimum_check_at" IS NOT NULL) OR ("academy_class"."kind" = 'masterclass' AND "academy_class"."cohort_full_rate_marks" IS NULL AND "academy_class"."cohort_half_rate_marks" IS NULL AND "academy_class"."cohort_single_rate_marks" IS NULL AND "academy_class"."masterclass_rate_marks" IS NOT NULL AND "academy_class"."masterclass_rate_marks" > 0 AND "academy_class"."minimum_enrollment" IS NULL AND "academy_class"."minimum_check_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "academy_class_session" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"capacity" integer NOT NULL,
	"title_en" text NOT NULL,
	"title_id" text,
	"curriculum_en" text,
	"curriculum_id" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"room_id" text,
	"tutor_id" text NOT NULL,
	"tutor_fee_idr" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academy_class_session_sequence_positive" CHECK ("academy_class_session"."sequence_number" > 0),
	CONSTRAINT "academy_class_session_capacity_positive" CHECK ("academy_class_session"."capacity" > 0),
	CONSTRAINT "academy_class_session_time_order" CHECK ("academy_class_session"."end_at" > "academy_class_session"."start_at"),
	CONSTRAINT "academy_class_session_mode_check" CHECK ("academy_class_session"."mode" IN ('online', 'in_person')),
	CONSTRAINT "academy_class_session_room_mode_check" CHECK (("academy_class_session"."mode" = 'online' AND "academy_class_session"."room_id" IS NULL) OR ("academy_class_session"."mode" = 'in_person' AND "academy_class_session"."room_id" IS NOT NULL)),
	CONSTRAINT "academy_class_session_fee_positive" CHECK ("academy_class_session"."tutor_fee_idr" > 0),
	CONSTRAINT "academy_class_session_state_check" CHECK ("academy_class_session"."state" IN ('draft', 'scheduled', 'completed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "academy_class" ADD CONSTRAINT "academy_class_competition_id_subject_category_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."subject_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class" ADD CONSTRAINT "academy_class_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class" ADD CONSTRAINT "academy_class_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session" ADD CONSTRAINT "academy_class_session_class_id_academy_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."academy_class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session" ADD CONSTRAINT "academy_class_session_room_id_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."room"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_class_session" ADD CONSTRAINT "academy_class_session_tutor_id_user_id_fk" FOREIGN KEY ("tutor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_class_competition_idx" ON "academy_class" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "academy_class_state_start_idx" ON "academy_class" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "academy_class_session_class_sequence_uniq" ON "academy_class_session" USING btree ("class_id","sequence_number");--> statement-breakpoint
CREATE INDEX "academy_class_session_tutor_start_idx" ON "academy_class_session" USING btree ("tutor_id","start_at");--> statement-breakpoint
CREATE INDEX "academy_class_session_room_start_idx" ON "academy_class_session" USING btree ("room_id","start_at");