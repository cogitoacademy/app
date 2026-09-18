# Temporary Knowledge Bank access override

Status: **Complete locally (2026-09-18)**

## Outcome

- Added `knowledge_bank_access_grant`, one optional grant per student with an
  admin-selected expiry, note, unique student index, and expiry index.
- Added the admin-only `adminKnowledgeBank.*` API for list/create/update/remove
  operations by student email, with case-insensitive lookup and audit events.
- Wired active-grant lookup into the wallet eligibility service and the
  Knowledge Bank metadata/file gates. Expiry is checked at request time, so an
  expired grant automatically returns the student to the normal 35-Mark rule.
- Added the `/admin-knowledge-bank` Selia admin page with search, status
  filters, add/edit dialogs, expiry display, and confirmation-gated removal.
- Updated the add dialog to select a student from the admin identity search,
  compose the shared Selia calendar with the cross-browser minute time picker,
  and default new expiries to 23:59 thirty days from today in local time.
- Kept the grant table within its card and confined narrow-screen horizontal
  scrolling to the table region below the padded filters.
- Updated architecture, API, module, runbook, and Marks-economy documentation.

## Verification

- `bun run check-types` — passed.
- `bun run lint` — passed with existing repository warnings only.
- Targeted API unit tests — 49 passed.
- Admin Knowledge Bank integration test — 2 passed against the isolated test
  database after applying migration `0048`.
- `bun run build:web` — passed.
- `bun run build` — passed for the web and server packages.
- The local test database's migration helper is still blocked by its
  pre-existing migration drift (migration records stop at `0046`); the new
  feature migration was applied directly to that isolated test database for
  the integration run.

## Operational note

Apply `0048_knowledge_bank_access_grant.sql` with `bun run db:migrate` before
deploying the API/web build. No expiry scheduler is required. Removed grants
are deleted from the live table while their audit records remain available.
