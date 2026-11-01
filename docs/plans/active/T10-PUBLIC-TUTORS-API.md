# T10 Public Tutor API Checkpoint

**Status: API and marketing tutor consumer implemented; overall T10 remains in progress.**
Updated 2026-10-19.

## Delivered

`publicContent.tutors.list` is an anonymous read for the marketing site's
server-side consumer. It uses the existing `onboardingStatus = "published"`
eligibility rule and a positive selected-column allowlist for tutor profile,
account, and subject catalog data. It includes only active assigned child and
parent catalog types, then checks those activity flags again in the mapper
without exposing them. Its mapper emits exactly:

`id`, `name`, `profileImageUrl`, `shortBio`, `affiliation`, `education`,
`achievements`, `experiences`, `subjects`, and `modality`. Subject items expose
the app catalog's English name, nullable Indonesian `nameId`, and parent
category name/slug plus nullable light/dark text/background palette values.
Each subject's parent object carries the palette inherited from its category.

The profile ID is the app tutor-profile ID. Images come from canonical
`user.image`; subjects use app catalog IDs/slugs/names. Nested structured
profile entries and catalog relations are mapped field by field. The endpoint
does not return `userId`, names/emails from raw account rows, prices or rates,
payout/tax fields, internal review or consent state, Sanity IDs, or unknown
future fields. It has no physical-location property: `modality` describes
teaching format and is never converted to a city. Empty results stay `[]`; DB
and mapping errors propagate as errors.

`tutors.listPublished` remains student-authenticated with its existing
discovery projection. The marketing site's full and featured tutor lists now
read this DTO server-side through a no-store adapter and validate the oRPC
envelope and tutor projection. The city filters are replaced by Online and
Offline teaching-format filters; a tutor with `both` matches either selection.
The competition-field filter is derived from active parent categories in the
published tutor results, and tutor specialization badges use the parent
category's light palette. Indonesian category names are used when present and
fall back to English. No city is inferred from modality, and there is no
Sanity fallback. API failures render a localized unavailable state, distinct
from a valid empty result. The marketing profile fields currently available in
the app remain English-only; this consumer uses the optional Indonesian
catalog names where the app provides them.

The first four API results continue to supply the landing-page tutor cards;
the API orders published profiles by publication date. This is a recency-based
selection, not an admin-managed featured flag.

## Verification

Marketing consumer verification on 2026-10-19: all website tests passed (21
tests, 62 assertions), including 8 tutor adapter/filter tests (22 assertions).
The marketing web TypeScript check, focused Oxlint/Oxfmt checks, and production
build passed. The production preview returned HTTP 200 for `/en/tutors` and
`/id/tutors` using a local mock API fixture; the English page rendered English
subject labels and the Indonesian page used available `nameId` labels. The
CUA/browser inventory was empty in this session, so no screenshot, dropdown
interaction, or visual breakpoint acceptance was claimed.

The integration fixture has a local-only `cogito-test` guard and `finally`
teardown; it does not reset or truncate the shared test database. It checks
anonymous access, published-vs-draft filtering, active-vs-inactive catalog
selection, seeded private profile fields, the exact output key set, and the
existing student-only discovery gate. It identifies its own profile by ID and
does not assume the shared test database has no other published tutors. The
focused unit test checks the SQL selection allowlist, strips synthetic
future/unknown fields from the row and nested JSON, and verifies inactive
filtering, empty results, and error propagation through the RPC route. On
2026-10-19 the integration suite passed: 1 test, 18 assertions; the unit suite
passed: 5 tests, 30 assertions. The integration `finally` cleanup was verified
to remove its exact fixture rows.

```powershell
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/unit/public-content.test.ts packages/api/src/tests/integration/public-content-tutors.test.ts
```

## Remaining T10 work

- Compare the intended public tutor roster against published app profiles and
  re-enter/approve any missing profiles before release; the site does not
  migrate or fall back to Sanity data during reads.
- FAQ database, admin CRUD/editor, public full/landing API, and marketing-site
  server consumer are implemented; see [T10 FAQ checkpoint](T10-FAQ-CHECKPOINT.md).
  Initial FAQ content still requires M01 approval.
- Activities/Other content API/site work and the T10 browser acceptance remain open.
- The marketing tutor consumer and the FAQ consumer both use server-side reads.
  If direct browser reads become required, add a deliberate CORS origin policy.

The related `RELEASE-V3-TASKS.md` T10 row records this API slice as implemented
while keeping T10 in progress for Activities/Other content, approved FAQ copy,
and release acceptance.
