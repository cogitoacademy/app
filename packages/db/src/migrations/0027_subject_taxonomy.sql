-- Tutor subject taxonomy: editable mother categories and selectable child subjects.
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

-- Source-informed mother categories from cogitoacademy.id/en.
INSERT INTO "subject_category" ("id", "parent_id", "slug", "name", "sort_order") VALUES
	('10000000-0000-4000-8000-000000000001', NULL, 'model-united-nations', 'Model United Nations', 10),
	('10000000-0000-4000-8000-000000000002', NULL, 'public-speaking', 'Public Speaking', 20),
	('10000000-0000-4000-8000-000000000003', NULL, 'olympiad', 'Olympiad', 30),
	('10000000-0000-4000-8000-000000000004', NULL, 'world-scholars-cup', 'World Scholar''s Cup', 40),
	('10000000-0000-4000-8000-000000000005', NULL, 'essay-scientific-writing', 'Essay & Scientific Writing', 50),
	('10000000-0000-4000-8000-000000000006', NULL, 'debate', 'Debate', 60),
	('10000000-0000-4000-8000-000000000007', NULL, 'business-plan', 'Business Plan', 70)
ON CONFLICT ("slug") DO UPDATE SET
	"parent_id" = EXCLUDED."parent_id",
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = true,
	"updated_at" = now();
-- statement-breakpoint

-- Initial child subjects. IDs are stable within the catalog; the API only
-- accepts active rows with a non-null parent_id for tutor selection.
INSERT INTO "subject_category" ("id", "parent_id", "slug", "name", "sort_order") VALUES
	('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'mun-debate', 'MUN Debate', 10),
	('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'mun-writing', 'MUN Writing', 20),
	('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'mun-conference-preparation', 'MUN Conference Preparation', 30),
	('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'public-speaking-speech', 'Speech', 10),
	('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'public-speaking-presentation', 'Presentation Skills', 20),
	('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'public-speaking-storytelling', 'Storytelling', 30),
	('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', 'math-olympiad', 'Mathematics Olympiad', 10),
	('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003', 'science-olympiad', 'Science Olympiad', 20),
	('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', 'informatics-olympiad', 'Informatics Olympiad', 30),
	('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000004', 'wsc-debate', 'WSC Debate', 10),
	('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000004', 'wsc-writing', 'WSC Writing', 20),
	('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000004', 'wsc-quiz-and-challenge', 'WSC Quiz & Challenge', 30),
	('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000005', 'essay-writing', 'Essay Writing', 10),
	('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000005', 'scientific-writing', 'Scientific Writing', 20),
	('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000005', 'academic-research', 'Academic Research', 30),
	('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000006', 'debate-fundamentals', 'Debate Fundamentals', 10),
	('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000006', 'debate-argumentation', 'Argumentation & Critical Thinking', 20),
	('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000006', 'debate-competition-preparation', 'Debate Competition Preparation', 30),
	('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000007', 'business-plan-writing', 'Business Plan Writing', 10),
	('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000007', 'business-pitch', 'Business Pitch', 20),
	('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000007', 'entrepreneurship', 'Entrepreneurship', 30)
ON CONFLICT ("slug") DO UPDATE SET
	"parent_id" = EXCLUDED."parent_id",
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = true,
	"updated_at" = now();

