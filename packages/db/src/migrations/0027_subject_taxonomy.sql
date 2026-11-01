-- Tutor specialization taxonomy: editable competition categories and selectable specializations.
-- The initial catalog is intentionally small and slug-stable so admins can
-- rename labels without breaking tutor selections or student filters.
CREATE TABLE "subject_category" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subject_category_parent_not_self_check" CHECK ("subject_category"."parent_id" IS NULL OR "subject_category"."parent_id" <> "subject_category"."id"),
	CONSTRAINT "subject_category_parent_id_subject_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "subject_category"("id") ON DELETE restrict
);
-- statement-breakpoint
CREATE UNIQUE INDEX "subject_category_slug_uniq" ON "subject_category" USING btree ("slug");
-- statement-breakpoint
CREATE INDEX "subject_category_parentId_idx" ON "subject_category" USING btree ("parent_id");
-- statement-breakpoint
CREATE INDEX "subject_category_active_parent_sort_idx" ON "subject_category" USING btree ("is_active","parent_id","sort_order");
-- statement-breakpoint
CREATE TABLE "tutor_profile_subject" (
	"id" text PRIMARY KEY NOT NULL,
	"tutor_profile_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tutor_profile_subject_tutor_profile_id_tutor_profile_id_fk" FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profile"("id") ON DELETE cascade,
	CONSTRAINT "tutor_profile_subject_subject_id_subject_category_id_fk" FOREIGN KEY ("subject_id") REFERENCES "subject_category"("id") ON DELETE restrict
);
-- statement-breakpoint
CREATE INDEX "tutor_profile_subject_tutorProfileId_idx" ON "tutor_profile_subject" USING btree ("tutor_profile_id");
-- statement-breakpoint
CREATE INDEX "tutor_profile_subject_subjectId_idx" ON "tutor_profile_subject" USING btree ("subject_id");
-- statement-breakpoint
CREATE UNIQUE INDEX "tutor_profile_subject_profile_subject_uniq" ON "tutor_profile_subject" USING btree ("tutor_profile_id","subject_id");
-- statement-breakpoint

-- Competition taxonomy is inserted by apps/server/src/seed/seed.ts.
