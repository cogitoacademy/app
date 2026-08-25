-- Replace the initial source-informed catalog with the competition taxonomy
-- used by tutor onboarding. Existing rows remain referenced by tutor profiles,
-- so they are archived instead of deleted.
UPDATE "subject_category"
SET "is_active" = false,
	"updated_at" = now();
-- statement-breakpoint

INSERT INTO "subject_category" ("id", "parent_id", "slug", "name", "sort_order", "is_active") VALUES
	('30000000-0000-4000-8000-000000000001', NULL, 'competition-model-united-nations', 'Model United Nations', 10, true),
	('30000000-0000-4000-8000-000000000002', NULL, 'competition-world-scholars-cup', 'World Scholar’s Cup', 20, true),
	('30000000-0000-4000-8000-000000000003', NULL, 'competition-essay-writing', 'Essay & Writing', 30, true),
	('30000000-0000-4000-8000-000000000004', NULL, 'competition-debate', 'Debate', 40, true),
	('30000000-0000-4000-8000-000000000005', NULL, 'competition-business', 'Business', 50, true),
	('30000000-0000-4000-8000-000000000006', NULL, 'competition-olympiad', 'Olympiad', 60, true),
	('30000000-0000-4000-8000-000000000007', NULL, 'competition-public-speaking', 'Public Speaking', 70, true)
ON CONFLICT ("slug") DO UPDATE SET
	"parent_id" = EXCLUDED."parent_id",
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = EXCLUDED."is_active",
	"updated_at" = now();
-- statement-breakpoint

INSERT INTO "subject_category" ("id", "parent_id", "slug", "name", "sort_order", "is_active") VALUES
	('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'competition-mun-research', 'Research', 10, true),
	('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'competition-mun-writing', 'Writing', 20, true),
	('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', 'competition-mun-speech', 'Speech', 30, true),
	('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'competition-mun-negotiation', 'Negotiation', 40, true),
	('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 'competition-wsc-writing', 'Writing', 10, true),
	('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000002', 'competition-wsc-debate', 'Debate', 20, true),
	('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000002', 'competition-wsc-subjects', 'Subjects', 30, true),
	('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000003', 'competition-essay-academic-essay', 'Academic Essay', 10, true),
	('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000003', 'competition-essay-creative-writing', 'Creative Writing', 20, true),
	('40000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000003', 'competition-essay-scientific-research', 'Scientific Research', 30, true),
	('40000000-0000-4000-8000-000000000011', '30000000-0000-4000-8000-000000000003', 'competition-essay-college-application-essay', 'College Application Essay', 40, true),
	('40000000-0000-4000-8000-000000000012', '30000000-0000-4000-8000-000000000003', 'competition-essay-journalistic-writing', 'Journalistic Writing', 50, true),
	('40000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000004', 'competition-debate-british-parliamentary', 'British Parliamentary', 10, true),
	('40000000-0000-4000-8000-000000000014', '30000000-0000-4000-8000-000000000004', 'competition-debate-asian-parliamentary', 'Asian Parliamentary', 20, true),
	('40000000-0000-4000-8000-000000000015', '30000000-0000-4000-8000-000000000004', 'competition-debate-world-schools-wsdc', 'World Schools (WSDC)', 30, true),
	('40000000-0000-4000-8000-000000000016', '30000000-0000-4000-8000-000000000004', 'competition-debate-bahasa-indonesia-ldbi', 'Bahasa Indonesia (LDBI)', 40, true),
	('40000000-0000-4000-8000-000000000017', '30000000-0000-4000-8000-000000000005', 'competition-business-model-canvas', 'Business Model Canvas', 10, true),
	('40000000-0000-4000-8000-000000000018', '30000000-0000-4000-8000-000000000005', 'competition-business-plan', 'Business Plan', 20, true),
	('40000000-0000-4000-8000-000000000019', '30000000-0000-4000-8000-000000000005', 'competition-business-case', 'Business Case', 30, true),
	('40000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-mathematics-smp', 'Mathematics (SMP)', 10, true),
	('40000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-natural-sciences-smp', 'Natural Sciences (SMP)', 20, true),
	('40000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-social-sciences-smp', 'Social Sciences (SMP)', 30, true),
	('40000000-0000-4000-8000-000000000023', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-mathematics', 'Mathematics', 40, true),
	('40000000-0000-4000-8000-000000000024', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-physics', 'Physics', 50, true),
	('40000000-0000-4000-8000-000000000025', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-chemistry', 'Chemistry', 60, true),
	('40000000-0000-4000-8000-000000000026', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-biology', 'Biology', 70, true),
	('40000000-0000-4000-8000-000000000027', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-informatics', 'Informatics', 80, true),
	('40000000-0000-4000-8000-000000000028', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-astronomy', 'Astronomy', 90, true),
	('40000000-0000-4000-8000-000000000029', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-earth-sciences', 'Earth Sciences', 100, true),
	('40000000-0000-4000-8000-000000000030', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-economics', 'Economics', 110, true),
	('40000000-0000-4000-8000-000000000031', '30000000-0000-4000-8000-000000000006', 'competition-olympiad-geography', 'Geography', 120, true),
	('40000000-0000-4000-8000-000000000032', '30000000-0000-4000-8000-000000000007', 'competition-public-speaking-persuasive-speech', 'Persuasive Speech', 10, true),
	('40000000-0000-4000-8000-000000000033', '30000000-0000-4000-8000-000000000007', 'competition-public-speaking-storytelling', 'Storytelling', 20, true)
ON CONFLICT ("slug") DO UPDATE SET
	"parent_id" = EXCLUDED."parent_id",
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = EXCLUDED."is_active",
	"updated_at" = now();
