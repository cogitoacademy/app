# T10 FAQ Checkpoint

**Status: rich FAQ storage/API/admin editor and public rich rendering are implemented with additive DTO fields and legacy fallback; FAQ copy and tutor-site projection remain separately gated.**
Updated 2026-10-19.

## Delivered in the app

- Migration `0058_faq_entries.sql` adds localized legacy fields, visibility, row version, and indexes. Migration `0059_faq_rich_text.sql` adds rich JSONB documents and backfills existing FAQ content while retaining the legacy columns.
- Authenticated students, tutors, and admins can read the full active FAQ at `/faq` through the anonymous public projection and Selia accordion. The admin-only `/admin-faq` editor remains separate; the sidebar labels it “Manage FAQs” for admins and exposes the read-only FAQ link to every app role.
- Anonymous `publicContent.faq.list` reads active entries at request time. The `landing` surface additionally filters `showOnLanding`; Indonesian question and answer independently fall back to English. Results are alphabetized by the displayed localized question, with the legacy `sortOrder` field retained as the display index.
- Admin-only `adminFaq.list/create/update` reads all rows and supports compare-and-swap updates using `expectedVersion`. Deactivation retains the record and removes it from public results; there is no destructive delete endpoint. At most six active rows may be selected for the landing surface; writes serialize that check in a transaction.
- `/admin-faq` is an English-chrome Selia admin page. English question and answer are mandatory; Indonesian fields are optional and hidden by default for new entries. The Tiptap editor supports bold, italic, safe links, and ordered/unordered lists. Rows are alphabetical, numbered, and show `modifiedAt`.
- Public responses retain the legacy plain-text `question`/`answer` fields and add locale-selected `questionRich`/`answerRich` documents. Admin flags/version stay private; API errors remain errors rather than being converted into empty results.

## Delivered in the marketing site

- The server-only adapter calls `/rpc/publicContent/faq/list` with the standard
  `{ json: { locale, surface } }` request, `cache: "no-store"`, and validation
  of the required `json` field, optional array-valued `meta`, legacy fields,
  optional rich documents, and safe links.
  It requires `COGITO_APP_API_URL`; it does not silently point a local build at
  production. Responses from an older API without rich fields remain accepted.
- The landing page requests `surface: "landing"`; `/{locale}/faq` requests the
  full active list. Header/footer navigation and the landing full-page link
  reach the localized FAQ route. FAQ content is never read from Sanity or a
  legacy Sanity source.
- Valid `[]` renders a localized empty state. Request/configuration/shape
  failures render a separate localized retry state; on the landing page, the
  failure stays within the FAQ section and does not replace the homepage.
  Failure output omits FAQ JSON-LD.
- FAQ answers render paragraphs, bold/italic runs, allowlisted links, and
  ordered/unordered lists from rich documents, with the legacy plain-text
  answer as fallback. Questions render text marks; link marks stay
  non-interactive inside button triggers. Landing cards use keyboard-operable
  native buttons, linked answer regions, visible focus, reduced-motion-aware
  transitions, full long questions/answers, and no nested answer scrolling.
  FAQ JSON-LD continues to use the legacy plain-text projection.

## Verification

On 2026-10-19:

- Rich FAQ unit/helper tests passed: 8 tests, 28 expectations.
- FAQ Postgres integration passed: 2 tests, 13 expectations.
- The earlier full API unit suite passed: 2,465 tests, 5,776 expectations. App
  web unit tests passed: 121 tests, 239 expectations. For this rich FAQ slice,
  the app web `check-types` and production build, E2E package `check-types`, and
  FAQ admin browser test passed; the web package typecheck now completes without
  the earlier memory blocker.
- FAQ admin Playwright coverage passed: 1 Chromium test. It checks student
  redirect, field errors/focus/ARIA, hidden/revealed Indonesian fields,
  rich formatting/linking, numbered alphabetical rows, card-body padding and
  default-font number sizing, create/edit, ordering/visibility, stale-version
  conflict recovery, and successful resave.
  Fixture rows were deleted by exact IDs under the local test-DB guard; a
  follow-up query found no matching E2E FAQ rows.
- Marketing tests passed: 24 tests, 75 expectations, including optional-metadata
  and rich-response validation, legacy-response fallback, unsafe-link rejection,
  and landing-card rendering. A local mock API returned 503 while `/{en,id}/faq` remained HTTP
  200 with localized `role=alert` retry content, no empty state, and no FAQ
  JSON-LD. Landing FAQ error rendering keeps its section and full-page link.
- A read-only probe against the configured loopback API returned `json` without
  `meta` or rich fields; the parser accepted it and retained the legacy FAQ
  projection. No database writes were made.
- Marketing `tsc --noEmit` and production build passed with
  `COGITO_APP_API_URL=http://127.0.0.1:4300`; Next marks FAQ and landing routes
  dynamic, so request-time API data is not baked into a static build. The build
  logged a non-blocking connection-refused warning from the unrelated local
  achievements endpoint. No production Cogito API call was made.
- A headless-browser smoke against a local FAQ API mock verified Enter/Space
  activation on the landing cards at desktop and mobile widths, and Space-open /
  Enter-close on the full FAQ accordion. The linked `aria-controls` and
  `aria-labelledby` relationship was checked. Tab-sequence and screen-reader
  behavior remain unverified.
- The integration test requires `NODE_ENV=test`, loopback DB host, and exact `cogito-test`; cleanup deletes only recorded fixture IDs. No database reset or truncate is used.
- Migrations `0058` and `0059` are applied to local `cogito-test`; `0059` is also applied to local development `cogito-app`. Production remains on the approved release migration path.
- The shared Playwright runner now validates exact `NODE_ENV=test` and loopback PostgreSQL `/cogito-test` before global setup can reset/seed. Config and setup load the same resolved env file; API/web URLs and ports must agree, both server ports must be free, and existing servers are never reused. Traces remain on failure even with `--retries=0`. See the [guarded E2E runbook](../../RUNBOOK.md#guarded-playwright-e2e-runs-2026-10-20).
- On 2026-10-20, parent verification of the guard passed 7 unit tests / 32 expectations and the E2E package typecheck. Browser E2E was not rerun during the integration checkpoint because it resets/seeds the shared `cogito-test` database; no test DB writes were made for this checkpoint. The guard commit does not change FAQ behavior.

Commands:

```powershell
bun test --timeout 30000 apps/web/src/lib/faq-rich-text.test.ts packages/api/src/tests/unit/faq.test.ts
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/faq.test.ts
bun run --filter web check-types
bun run --filter @cogito-app/e2e check-types
```

Marketing website tests are run from `C:/.Projects/cogito-acad`:

```powershell
bun test apps/web/tests
```

FAQ admin browser coverage is run from `packages/e2e`:

```powershell
bun run --filter @cogito-app/e2e test -- faq-admin.spec.ts --retries=0
```

Run the destructive Playwright setup only after ensuring no other worker is
using `cogito-test` and the dedicated API/web ports are free. From the repo
root in PowerShell, the guarded command is:

```powershell
Push-Location packages/e2e
$env:NODE_ENV = 'test'
$env:ENV_FILE = '../../apps/server/.env.test'
bun run test -- faq-admin.spec.ts --retries=0
Remove-Item Env:NODE_ENV, Env:ENV_FILE
Pop-Location
```

## Remaining T10 work and gates

- Seed FAQ copy only after the approved M01 content inventory is available. The API currently returns an empty list until admin content is entered.
- Configure `COGITO_APP_API_URL` in each marketing-site runtime. Verify its deployed value points to the app API before publishing the FAQ consumer.
- Apply migrations 0058 and 0059 to any shared environment only through the approved release migration process, in that order and before deploying API code that queries the rich columns; local dev/test application does not imply deployment.
- Website tutor cutover is a separate T10 consumer and remains gated on whether city-level filtering/display is retired or replaced by approved modality behavior. Never infer city from `modality`.

No client copy, shared/production database, or provider data was changed. Local `cogito-app` and isolated `cogito-test` were migrated; local test seed credentials were synchronized and stale E2E FAQ fixtures were removed for verification.
