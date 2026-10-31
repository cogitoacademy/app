UPDATE "subject_category"
SET
	"light_text_color" = CASE "slug"
		WHEN 'business-plan' THEN 'oklch(0.2036 0.0029 247.97)'
		ELSE 'oklch(1 0 0)'
	END,
	"light_background_color" = CASE "slug"
		WHEN 'model-united-nations' THEN 'oklch(0.695641 0.132326 232.54)'
		WHEN 'world-scholars-cup' THEN 'oklch(0.884795 0.181642 94.9)'
		WHEN 'essay-scientific-writing' THEN 'oklch(0.698358 0.202646 44.07)'
		WHEN 'debate' THEN 'oklch(0.581114 0.199813 315.44)'
		WHEN 'business-plan' THEN 'oklch(0.804266 0.214364 151.41)'
		WHEN 'olympiad' THEN 'oklch(0.566845 0.202167 31.43)'
		WHEN 'public-speaking' THEN 'oklch(0.773372 0.101596 354.57)'
	END,
	"dark_text_color" = CASE "slug"
		WHEN 'business-plan' THEN 'oklch(0.2036 0.0029 247.97)'
		ELSE 'oklch(1 0 0)'
	END,
	"dark_background_color" = CASE "slug"
		WHEN 'model-united-nations' THEN 'oklch(0.695641 0.132326 232.54)'
		WHEN 'world-scholars-cup' THEN 'oklch(0.884795 0.181642 94.9)'
		WHEN 'essay-scientific-writing' THEN 'oklch(0.698358 0.202646 44.07)'
		WHEN 'debate' THEN 'oklch(0.581114 0.199813 315.44)'
		WHEN 'business-plan' THEN 'oklch(0.804266 0.214364 151.41)'
		WHEN 'olympiad' THEN 'oklch(0.566845 0.202167 31.43)'
		WHEN 'public-speaking' THEN 'oklch(0.773372 0.101596 354.57)'
	END
WHERE "parent_id" IS NULL
	AND "slug" IN (
		'model-united-nations',
		'world-scholars-cup',
		'essay-scientific-writing',
		'debate',
		'business-plan',
		'olympiad',
		'public-speaking'
	);
