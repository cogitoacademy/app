-- Remove only the original 0027 catalog; the 0029 taxonomy remains authoritative.
-- Referenced seeds must be cleaned up explicitly before this migration can run.
DO $$
DECLARE
  seed record;
BEGIN
  FOR seed IN
    SELECT id, slug FROM subject_category
    WHERE id IN (
      SELECT '10000000-0000-4000-8000-' || lpad(n::text, 12, '0')
      FROM generate_series(1, 7) AS n
      UNION ALL
      SELECT '20000000-0000-4000-8000-' || lpad(n::text, 12, '0')
      FROM generate_series(1, 21) AS n
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM tutor_profile
      WHERE coalesce(pending_profile_changes->'subjectIds', '[]'::jsonb) ? seed.id
    ) OR EXISTS (
      SELECT 1 FROM booking
      WHERE session_topic->>'categoryId' = seed.id
         OR session_topic->>'subcategoryId' = seed.id
         OR session_topic->>'categorySlug' = seed.slug
         OR session_topic->>'subcategorySlug' = seed.slug
         OR price_snapshot->>'competition' = seed.slug
    ) OR EXISTS (
      SELECT 1 FROM booking_session
      WHERE price_snapshot->>'competition' = seed.slug
    ) OR EXISTS (
      SELECT 1 FROM economy_v3_revision
      WHERE coalesce("values"->'competitionRates', '{}'::jsonb) ? seed.slug
    ) THEN
      RAISE EXCEPTION 'Superseded competition seed % (%) is still referenced; clean up its references before retrying migration 0078', seed.id, seed.slug;
    END IF;
  END LOOP;

  -- Foreign keys also reject remaining tutor, class, calendar or custom-child references.
  DELETE FROM subject_category
  WHERE id IN (
    SELECT '20000000-0000-4000-8000-' || lpad(n::text, 12, '0')
    FROM generate_series(1, 21) AS n
  );
  DELETE FROM subject_category
  WHERE id IN (
    SELECT '10000000-0000-4000-8000-' || lpad(n::text, 12, '0')
    FROM generate_series(1, 7) AS n
  );
END $$;
