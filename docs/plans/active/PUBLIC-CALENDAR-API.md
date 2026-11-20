# Public App-Sourced Competition Calendar

Status: implemented on `feat/public-calendar-api`; not pushed, no PR.

## Goal

The marketing site should display the competition calendar from the app instead
of Sanity. The app exposes one anonymous read of active `calendar_event` rows.
Current calendar content is English-only, so no bilingual database fields are
part of this slice.

## Implementation

- [x] Add anonymous `publicContent.calendar.list` at
      `/rpc/publicContent/calendar/list`.
- [x] Accept the marketing site's `{ locale?: "en" | "id" }` input; locale is
      contract compatibility only and does not change the English response.
- [x] Query only active events ordered by start date, using a strict public
      column allowlist.
- [x] Project categories with `id`, `slug`, `name`, and optional `parentColors`.
- [x] Rate-limit the path to 300 requests per minute per IP.
- [x] Add focused unit/integration tests and docs.

## Contract

`POST /rpc/publicContent/calendar/list`

Input: `{ locale?: "en" | "id" }` (default `en`, strict object).

Output: `PublicCompetition[]` with `id`, `title`, `description`, `location`,
`startDate`, `endDate`, `categories[{ id, slug, name, parentColors }]`,
`educationLevels`, `scale`, `organizer`, `registrationDeadline`,
`registrationLink`, `socialMediaLink`.

No source hashes, versions, audit fields, active/sort flags, or Knowledge Bank
data are returned.

## Verification

- `bun test packages/api/src/tests/unit/public-content.test.ts`
- `bun test --timeout 30000 --env-file <local-test-env> packages/api/src/tests/integration/public-calendar.test.ts`
- `bun run --cwd apps/server check-types`
- `bun run --cwd apps/web check-types`

The integration test uses a local `cogito-test` database and removes its own
fixtures. No migration, reset, seed, or production write is required.

## Remaining operations

- Deploy the API and web bundle together.
- Point/deploy the marketing site and smoke-test both locale routes; both will
  show the app's current English calendar content.
