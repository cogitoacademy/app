# T10 FAQ Checkpoint

**Status: app database/API/admin editor and marketing-site full/landing consumers implemented; initial copy and tutor-site projection remain gated.**
Updated 2026-10-19.

## Delivered in the app

- Migration `0058_faq_entries.sql` adds English-required and optional Indonesian questions/answers, ordered paragraph/list blocks, active and landing visibility, row version, and indexes.
- Anonymous `publicContent.faq.list` reads active entries at request time. The `landing` surface additionally filters `showOnLanding`; Indonesian question and answer independently fall back to English.
- Admin-only `adminFaq.list/create/update` reads all rows and supports compare-and-swap updates using `expectedVersion`. Deactivation retains the record and removes it from public results; there is no destructive delete endpoint.
- `/admin-faq` is an English-chrome Selia admin page. English question and answer are mandatory; Indonesian fields are optional. Answers are validated paragraph/list data and are not interpreted as HTML.
- Strict public/admin DTOs prevent admin flags and version fields from reaching public consumers. API errors remain errors rather than being converted into an empty list.

## Delivered in the marketing site

- The server-only adapter calls `/rpc/publicContent/faq/list` with the standard
  `{ json: { locale, surface } }` request, `cache: "no-store"`, and strict
  validation of the oRPC response envelope and public entry shape. It requires
  `COGITO_APP_API_URL`; it does not silently point a local build at production.
- The landing page requests `surface: "landing"`; `/{locale}/faq` requests the
  full active list. Header/footer navigation and the landing full-page link
  reach the localized FAQ route. FAQ content is never read from Sanity or a
  legacy fallback.
- Valid `[]` renders a localized empty state. Request/configuration/shape
  failures render a separate localized retry state; on the landing page, the
  failure stays within the FAQ section and does not replace the homepage.
  Failure output omits FAQ JSON-LD.
- FAQ answers render as text, ordered lists, or unordered lists. Landing cards
  use keyboard-operable native buttons, linked answer regions, visible focus,
  reduced-motion-aware transitions, full long questions/answers, and no nested
  answer scrolling.

## Verification

On 2026-10-19:

- FAQ unit tests passed: 5 tests, 19 assertions.
- FAQ Postgres integration passed again: 1 test, 8 assertions.
- The full API unit suite passed: 2,465 tests, 5,776 expectations. App web unit
  tests passed: 121 tests, 239 expectations. The app web production build,
  web/server/E2E type checks, and the FAQ admin browser test passed.
- FAQ admin Playwright coverage passed: 1 Chromium test. It checks student
  redirect, field errors/focus/ARIA, optional Indonesian fields, create/edit,
  ordering/visibility, stale-version conflict recovery, and successful resave.
  Fixture rows were deleted by exact IDs under the local test-DB guard; a
  follow-up query found no matching E2E FAQ rows.
- Marketing FAQ tests passed: 13 tests, 40 expectations. A local mock API
  returned 503 while `/{en,id}/faq` remained HTTP 200 with localized `role=alert`
  retry content, no empty state, and no FAQ JSON-LD. Landing FAQ rendering was
  verified to keep the section and full-page link while displaying the error.
- The marketing production build passed with
  `COGITO_APP_API_URL=http://127.0.0.1:4300`; Next marks both the localized
  landing route and FAQ route dynamic, so request-time API data is not baked
  into a static build. No production Cogito API call was made.
- A headless-browser smoke against a local FAQ API mock verified Enter/Space
  activation on the landing cards at desktop and mobile widths, and Space-open /
  Enter-close on the full FAQ accordion. The linked `aria-controls` and
  `aria-labelledby` relationship was checked. Tab-sequence and screen-reader
  behavior remain unverified.
- The integration test requires `NODE_ENV=test`, loopback DB host, and exact `cogito-test`; cleanup deletes only recorded fixture IDs. No database reset or truncate is used.
- Migration 0058 has been applied only to the local `cogito-test` database. It has not been applied to development or production.

Commands:

```powershell
bun test packages/api/src/tests/unit/faq.test.ts
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/faq.test.ts
bun run --filter web check-types
```

Marketing website tests are run from `C:/.Projects/cogito-acad`:

```powershell
bun test apps/web/tests
```

FAQ admin browser coverage is run from `packages/e2e`:

```powershell
bun run --filter @cogito-app/e2e test -- faq-admin.spec.ts --retries=0
```

## Remaining T10 work and gates

- Seed FAQ copy only after the approved M01 content inventory is available. The API currently returns an empty list until admin content is entered.
- Configure `COGITO_APP_API_URL` in each marketing-site runtime. Verify its deployed value points to the app API before publishing the FAQ consumer.
- Apply migration 0058 to any shared environment only through the approved release migration process; local test application does not imply deployment.
- Website tutor cutover is a separate T10 consumer and remains gated on whether city-level filtering/display is retired or replaced by approved modality behavior. Never infer city from `modality`.

No client copy, shared database, production, or provider data was changed by this implementation.
