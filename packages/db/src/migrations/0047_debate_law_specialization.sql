-- Add the Law Debate specialization to the active competition taxonomy.
INSERT INTO "subject_category" (
	"id",
	"parent_id",
	"slug",
	"name",
	"sort_order",
	"is_active"
)
VALUES (
	'40000000-0000-4000-8000-000000000034',
	'30000000-0000-4000-8000-000000000004',
	'competition-debate-law',
	'Law Debate',
	50,
	true
)
ON CONFLICT ("slug") DO UPDATE SET
	"parent_id" = EXCLUDED."parent_id",
	"name" = EXCLUDED."name",
	"sort_order" = EXCLUDED."sort_order",
	"is_active" = EXCLUDED."is_active",
	"updated_at" = now();
