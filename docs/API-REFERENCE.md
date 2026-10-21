# Cogito API Reference

Admin class cancellation RPCs: `/rpc/classes/previewAdminCancellation` accepts
`{"json":{"classId":"uuid","expectedVersion":1,"reason":"audited reason"}}`.
`/rpc/classes/confirmAdminCancellation` adds requestKey (UUID) and quoteVersion.
Both require admin authentication. Response includes classId, expectedVersion,
feeMarks (zero), returnMarks, retainedMarks, cancelledSessionIds,
releasedAllocationIds and quoteVersion. Confirmation rechecks amounts and class
version under locks; same request/quote replay returns its saved receipt.
Student `/rpc/classes/getMyEnrollments` also returns the owner's historical
enrollments after parent cancellation, with no sellable sessions. Unrelated
students cannot discover a non-published class through this history read.

Student class cancellation RPCs: `POST /rpc/classes/quoteCancellation` accepts
`{"json":{"enrollmentId":"uuid","sessionId":"optional owned session UUID"}}`.
Omit sessionId for withdrawal. `POST /rpc/classes/confirmCancellation` adds
`requestKey` (UUID) and `quoteVersion` from the preview. Responses use the normal
JSON envelope and include feeRateBps, feeMarks, returnMarks, retainedMarks,
per-allocation deadlines and unpaid allocation IDs. Quotes are ownership-scoped;
stale quotes return conflict. Replaying the same request/quote returns its saved
receipt without another wallet mutation. Only active enrollments qualify.
Individual cancellation applies to funded future scheduled seats at least 24h
before start, inclusive; unpaid-half removal uses withdrawal.

T03 parent acceptance: selected-source prepare/record/void/reconcile procedures
passed the real isolated Postgres acceptance suite on 6770. Exact-net and repeat
transfer behavior are exercised against actual database transactions. Browser
presentation coverage uses mocked payout RPC responses; it is not API acceptance.

Local signup OTP test fixtures remain test-only and loopback-only for exact
`cogito-test` on ports 6767/6768/6769. Port 6769 is the disposable parent
verification target; this adds no production route or proof bypass.

The Playwright global-setup reset adds no API route. It accepts only the dedicated loopback T05 `cogito-test` database on port 6769, or the separate `cogito-test-payout` database on port 6770. It skips cleanup on ports 6767 and 6768 so existing dev/signup setup can continue without this reset. On T05 it targets only the exact Andre by Cogito seed identity, clears that student’s class enrollment graph in a single transaction, and stops before writes if report/payout references or unsupported financial state are present.

Enrollment confirmation revalidates checkout expiry after transaction locks and
requires all reserved sessions to remain scheduled in the future before any
Marks hold. A session that started during checkout requires a fresh enrollment;
an expired checkout returns the existing expired outcome. Second-installment
deadline checks also use time read after transaction locks.

Enrollment schema milestone (2026-10-21): additive migration `0064` stores
enrollment snapshots, installment state, per-session seat/funding allocations,
and immutable top-up attempts. T05 registers authenticated enrollment
procedures below; public `classes.list/get` remain published-class reads.

## Competition catalog CRUD — working branch (2026-10-18)

T00A / REQ-COMP-01..07 implementation is in progress; verification is recorded in
TASKS. Admin-only procedure keys below use `/rpc/admin/<key>` and the standard
`{"json": <input>}` envelope. Existing discovery subject reads remain public.

| Procedure key                                                       | Input / behavior                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listCompetitionCatalog`                                            | `{query?,includeArchived?}`; searchable entries, default includes inactive                                                                                 |
| `getCompetitionCatalogEntry`                                        | `{id}`; entry, parent and children                                                                                                                         |
| `previewCompetitionCatalogImpact`                                   | `{id}`; entry, child count and reference counts; mutation rechecks                                                                                         |
| `createCompetitionParent`                                           | `{slug,name,nameId?,description?,descriptionId?,sortOrder?,lightTextColor,lightBackgroundColor,darkTextColor,darkBackgroundColor,reason}`; inactive parent |
| `createCompetitionSpecialization`                                   | `{parentId,slug,name,nameId?,description?,descriptionId?,sortOrder?,reason}`; child of a root only; palette fields rejected                                |
| `updateCompetitionCatalogEntry`                                     | `{id,expectedVersion,reason,...editableFields}`; labels/descriptions/order, never slug/level                                                               |
| `moveCompetitionSpecialization`                                     | `{id,parentId,expectedVersion,reason}`; unused child only                                                                                                  |
| `archiveCompetitionCatalogEntry` / `restoreCompetitionCatalogEntry` | `{id,expectedVersion,reason}`; lifecycle with impact response; restore requires parent/rate readiness                                                      |
| `deleteCompetitionCatalogEntry`                                     | `{id,expectedVersion,reason}`; unused entry only, root must have no children                                                                               |

`name`/`description` are English; `nameId`/`descriptionId` are optional Indonesian.
S05 palette contract (integration in progress): parent creation additionally
requires `lightTextColor`, `lightBackgroundColor`, `darkTextColor` and
`darkBackgroundColor`, all validated normalized opaque numeric `oklch(L C H)`.
Parent updates can patch individual colors; omitted values remain unchanged.
Child inputs reject palette fields and reads inherit a `parentColors` object.
These safe color values can be projected to published content/current labels;
they do not change financial snapshots or expose private catalog references.
Reason is mandatory for writes. Missing entries return NOT_FOUND; stale versions,
duplicate slug, referenced delete/move and unavailable restore return CONFLICT.
Unknown fields are rejected; supplied slug/hierarchy edits cannot bypass the
dedicated operations. New roots remain draft until dynamic pricing integration;
the current readiness check recognizes existing slug-keyed configured rates.
These routes do not activate customer V3 pricing. PostgreSQL integration checks
verify the shared transaction lock serializes assignment against delete and
booking `sessionTopic` creation against archive in either order. A booking that
commits first is counted in archive impact and keeps its stored category and
specialization IDs/slugs; an archive that commits first makes the queued booking
fail with `BOOKING_NOT_EDITABLE`. A stale concurrent edit returns `CONFLICT`
after the first edit increments the row version. Exact local evidence and the
remaining T00A release gates are tracked in TASKS. A focused Chromium browser
journey also verifies the archive/restore and move UI against these procedures;
the RPC keys, input envelopes and response contract are unchanged.

## V3 quoted top-ups (2026-10-18)

Authenticated RPCs use `{"json": <input>}` and the standard JSON response envelope.

| Path                                   | Input                                | Result                                                                                                                      |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/rpc/payment/getTopUpCatalog`         | None                                 | `active`, revision or null, packages (code/label/Marks/IDR), surcharge and 900-second quote TTL                             |
| `/rpc/payment/createTopUpQuote`        | `{requestKey:UUID,marks:1..1000000}` | Owned quote ID, pinned revision, requested Marks/custom IDR, exact package or null, recommended package or null, ISO expiry |
| `/rpc/payment/createPurchaseFromQuote` | `{quoteId:UUID,choice:"package"      | "custom"                                                                                                                    | "recommended"}` | Payment ID/reference/URL/status/recoveryRequired plus pinned quote choice and purchase label |

Same student/request key replays the original offer; different Marks conflict.
Amounts beyond PostgreSQL integer capacity fail BAD_REQUEST before persistence.
The first payment requires an unexpired offer. Existing payment retries survive
offer expiry but cannot switch choice. Foreign/missing offers are NOT_FOUND;
expired/changed-choice/inactive offers return CONFLICT. Test-provider purchase
restrictions also apply to quoted checkout. No activation endpoint is exposed.
`getPurchase` additionally returns nullable quoteId/quoteChoice/purchaseLabel and
providerIntentState. Existing `createPurchase` keeps its legacy path while V3 is
inactive; active V3 requires quoted checkout for new sales.

V3 booking creation requires a server-resolvable supported competition topic.
Unresolvable/unsupported topics fail BAD_REQUEST; unavailable historical V3
revision fails CONFLICT before wallet writes. Active V3 group-series creation
prices at target headcount and pins that revision. When invitations resolve to a
partial group, repricing uses the booking's pinned revision at confirmed
headcount, updates each survivor's remaining scheduled-session hold and the
booking/scheduled-session snapshots before reconfirmation. With no active V3
pointer, legacy group-series pricing remains in force; target-size-one solo
series is unchanged. Historical untagged snapshots remain readable.

## V3 completion-feedback validation (2026-10-18)

Existing `/rpc/booking/completeSession` keeps its bookingId/sessionId/feedback
shape. Each of discussion/strengths/improvements must contain nonempty normalized
text with at most 600 Unicode code points in total, including one LF between
nonempty bullet lines. Normalize CRLF/CR, remove UI `• ` prefixes, trim edges
and discard empty lines before counting. An emoji outside the BMP counts as one
code point, not two UTF-16 units. Invalid submissions fail before settlement.
Direct service overlength raises domain `REPORT_TOO_LONG`, mapped to BAD_REQUEST;
missing/empty fields retain the existing completion-feedback-required error.
Technical request guards cap each raw string at 10000 UTF-16 units and each
raw field array at 600 entries. They are not a per-bullet business allowance.
Historical report responses remain readable without applying new write limits.

## V3 draft economy settings (2026-10-18)

Admin-only RPCs, with the standard `json` request envelope:

| Runtime path                          | Input                             | Output                                                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/rpc/admin/getV3EconomySettings`     | None                              | Latest `{version,values,status:"draft",createdAt,createdBy,reason,competitions}`; `competitions` lists every catalog parent with `{id,slug,name,isActive,rateConfigured,rate}`; virtual defaults at revision 0 before first save |
| `/rpc/admin/previewV3EconomySettings` | `{values,exactMarks?}`            | `{status:"draft",sessions,topUp:quoteOrNull}`; one row per configured parent × modality × headcount 1–6; no writes                                                                                                               |
| `/rpc/admin/saveV3EconomySettings`    | `{expectedVersion,values,reason}` | New immutable draft revision; stale version returns `CONFLICT`                                                                                                                                                                   |

`values` contains packages (`code,marks,priceIdr`), exactSurchargeIdr,
competitionRates (a map from parent competition slug to `soloMarks/soloFeeIdr`),
onlineAdditionalMarks/onlineAdditionalFeeIdr, offlineBaseAdditionalMarks,
offlineAdditionalMarks/offlineBaseAdditionalFeeIdr/offlineAdditionalFeeIdr.
Packages require unique codes, ascending Marks/prices and decreasing unit rates.
All seven canonical legacy parent rates are required; any additional key must
match an existing catalog parent. Missing additional rates remain blank in the
editor and are omitted from a saved revision until both values are entered.
Specializations inherit their parent's rate and cannot own a separate rate.
Unknown or child slugs fail validation. Group fees must fit the supported IDR
bound. Reason is trimmed, required, max 2000 characters. Exact preview input is
1–1,000,000 Marks. Anonymous/student/tutor access is denied; malformed payloads
fail validation. Migration 0054 is required.

Catalog, Economy editor and booking/discovery APIs use stable parent slugs, so
new competition types do not require a code enum. A parent without a saved rate
is not priced. The draft rate revision does not activate customer pricing: with
the activation pointer unset, the seven legacy paths remain compatible and new
parent slugs are rejected instead of falling back to tutor base rates. Only an
explicitly active revision prices new bookings/discovery; existing V3 booking
snapshots continue to resolve their pinned immutable revision.

Pricing exports `calculateV3SessionPrice` and `calculateV3TopUpPrice`, accepting
an optional validated configuration. Session output separates total, rounded
per-student/collected Marks and tutor fee IDR. Top-up output preserves requested
Marks, amount IDR, exact package code and advisory recommendation. These are
calculations, not payable quotes. Customer booking and discovery pricing now
read the active revision when the nullable activation pointer is set; the
pointer remains unset in this work, so no live customer price changed. Apart
from the admin draft RPCs above, SPEC's V3 API inventory remains proposed.

## SnapCN video tooling (2026-10-18)

`apps/video` is local Remotion authoring/render tooling. It adds no HTTP/RPC
endpoint, authentication rule, request/response contract, or backend dependency.
Its `CogitoIntro` composition is registered at 1280×720, 30 fps, 90 frames.

Last updated: 2026-10-18

## Student dashboard balance CTA fit (2026-10-02)

The compact dashboard CTA adjustment is frontend-only. **Find a tutor** remains
a labeled link to `/tutors`; the dashboard's secondary icon-only cash-plus link
keeps the accessible name **Top up** and links to `/balance`. No RPC path,
request envelope, response shape, authentication rule, schema, or persistence
contract changed.

## Role-based dashboard analytics (2026-09-25)

Student and tutor dashboards reuse the protected `booking.listMine` aggregate
read for action, upcoming, completed, and problem counts. Counts are exact for
the viewer's accessible bookings and are not limited to the first page. Student
achievement cards use `achievement.stats`; tutor availability cards use
`tutor.listAvailability`. The admin dashboard adds queue counts from existing
admin booking, tutor-review, and achievement-review reads. No new RPC endpoint
was added. Balance readiness remains a presentation decision from the existing
`wallet.get` available/held/total snapshot; it does not estimate future booking
affordability.

Booking date labels render `Asia/Jakarta` as `WIB` instead of the browser's
`GMT+7` short timezone label. Other IANA timezones retain the native Intl short
label. Shared empty states use the existing Selia token system and remain
presentation-only; the dashed-border experiment was reverted.

## Temporary Knowledge Bank access grants (2026-09-18)

Admins can grant a specific student temporary Knowledge Bank access by email
from `/admin-knowledge-bank`. The grant bypasses the student 35-Mark threshold
until `expiresAt`; the eligibility check evaluates the timestamp on every
request, so the student automatically needs the normal minimum Marks again
after expiry. Admins can edit the expiry/note or remove the grant. Removing the
live row does not remove its audit-log history. The web create dialog uses the
admin-only `admin.searchUsers` identity lookup to select the student before
sending the email to `adminKnowledgeBank.create`; its calendar and minute time
controls are browser-independent, and new grants default to 23:59 thirty days
out in the operator's local timezone. The table containment and narrow-screen
horizontal scrolling are frontend-only and do not change any RPC contract.

## Offline Calendar room metadata (2026-09-18)

When `room.assign` or `room.relocate` syncs an offline booking to Google
Calendar, the event description begins with `Site: {room.location}` and
`Room: {room.name}`. The existing booking metadata follows those two lines.
This is provider-side metadata only; no RPC input, output, or response envelope
changed.

## Competition Calendar agenda list (2026-09-18)

The authenticated 30-day agenda now renders a flat list: each overlapping
competition appears once, including multi-day competitions, ordered by its
first event date. The displayed event date remains the full competition range.
This is frontend-only; `content.listCompetitions` keeps the same path, input,
output, authentication, and response envelope.

## Achievement summary UI note (2026-09-09)

The student achievement summary was compacted into one three-column card and
the page component typo was corrected. Achievement RPC paths, inputs, response
envelopes, and outputs are unchanged.

## Dashboard greeting presentation (2026-09-08)

Student, tutor, and admin dashboard greetings are selected entirely in the web
client from role, browser-local hour, and already-fetched dashboard counts. No
RPC endpoint, request envelope, response shape, or persistence contract
changed. The admin account name is intentionally ignored for greeting copy and
rendered as `Admin`.

## Booking-detail action presentation (2026-09-08)

All available booking actions now render in the shared detail header below the
status badge. Lifecycle context replaces the generic state description when a
response or explanation is needed, and the old sticky-rail Booking actions card
is removed. Per-session series rescheduling remains on its target session row.
No RPC input, output, or route contract changed; this note supersedes older
frontend placement descriptions below.

> **Competition color note (2026-09-08):** Competition colors remain presentation-only and are derived in the web client from each category's existing `coreCategory`. Competition-field badges use the solid academy treatment with white foregrounds except for Business Plan's dark foreground; calendar event surfaces retain the soft treatment. No RPC input or output shape changed.

## Server-backed table pagination (2026-09-04)

All database-backed web tables now request bounded pages from the API. The
offset-backed achievement and room procedures accept `limit` and `offset`; the
admin booking queue and wallet ledger use their existing cursor contracts; and
the admin tutor tables retain their existing offset contract. Manage Tutors
keeps independent invitation/profile pagination, while the dedicated
`/admin-tutor-payouts` workspace requests ten tutor profiles per page and loads
the pending payout summary for each visible tutor. Table UIs request one
sentinel row (`pageSize + 1`) where needed to determine `hasNext`, render only
the requested page size, keep the current page visible while fetching, and
reset the page when filters or the selected wallet change. Fixed schedule and
pricing reference tables are intentionally not paginated because they render a
small, finite configuration matrix rather than a database collection.

## Tutor discovery filter viewport containment (2026-09-04)

The student `/tutors` filter stack now uses shrinkable, viewport-bounded
containers, and shared Selia select positioners/popups cap at Base UI's
`--available-width` boundary so category/specialization options do not get
clipped at narrow widths. This is a presentation-only fix;
`tutors.listSubjects` and `tutors.listPublished` keep the same RPC paths,
request envelope, inputs, outputs, and authentication.

## Student dashboard balance widget (2026-09-04)

The student dashboard now presents the existing `wallet.get` total, held, and
available values in a compact balance widget. Knowledge Bank access is derived
from the existing 35-total-Mark rule on the Balance page, which reuses the same
widget beside its access card on desktop. Existing routes are reused; no RPC
path, input, response, schema, or persistence contract changed.
The widget's Balance-page CTA is presentation-only: **Find a tutor** links to
`/tutors`, while the dashboard variant retains **Top up** to `/balance`.

## Card title info preview (2026-09-04)

The admin Booking activity explanation now opens from the shared Selia
`CardInfoPreview` popover trigger beside its card title. Booking-detail cards
and their admin extensions, plus explanatory headers on dashboard, admin, tutor,
profile, notification, and wallet surfaces use the same pattern instead of
standalone header descriptions. Sign-in and sign-up use title-only headers. This frontend-only change
adds no RPC path and changes no request envelope, response shape, schema, or
persistence contract.

## Competition Calendar empty months (2026-09-04)

The month-view presentation keeps its standard calendar grid when the selected
month has no returned events, so month navigation and date cells remain usable.
This is a frontend-only behavior change; `content.listCompetitions` keeps the
same input, output, authentication, and response envelope. When no published
competitions are returned, the page-level empty state keeps its calendar glyph
in the Cogito orange accent.

## Sidebar booking-action badge (2026-09-04)

The authenticated sidebar reuses `booking.listMine` with `view: "action"` to
show the role-visible count beside `/bookings`. The action view includes
pending booking decisions and tutor-owned scheduled sessions whose end time
has passed and still require `completeSession`; series bookings use ended child
sessions. It caps the display at `99+` when another cursor remains. No new RPC
path, request input, response output, schema, or persistence contract was
added.

## Sidebar logo contrast (2026-09-04)

The authenticated sidebar keeps the branded logo colors in light mode and
renders the complete logo white in dark mode. This is frontend-only
presentation behavior; no RPC path, request envelope, response shape, schema,
or persistence contract changed.

## Sidebar navigation order (2026-09-04)

The authenticated shell reorders existing role-specific sidebar links so the
primary journey comes first for each role: students see `Dashboard`, `Tutors`,
`My Bookings`, `Balance`, and `Achievements`; tutors see `Dashboard`, `Bookings`,
`Availability`, and `Tutor Profile`; admins see `Dashboard`, `Operations`,
`Bookings`, `Tutors`, `Economy`, and `Achievements`. Resources and the footer
account menu are unchanged, as are all RPC paths, request envelopes, response
shapes, authentication rules, schemas, and persistence contracts.

## Production UI and E2E audit (2026-09-04)

The UI/E2E hardening in this audit does not add or change an API endpoint,
procedure key, request input, response output, authentication rule, schema, or
persistence contract. Browser coverage continues to use the existing slash
RPC paths and the `{"json": <input>}` request envelope, with responses shaped as
`{"json": <data>, "meta": [...]}`.

The 2026-09-05 CI browser-install correction is tooling-only: Chromium is
installed from `packages/e2e` so its revision matches the locked Playwright
package. No endpoint, RPC path, input, output, or authentication contract
changes.

The 2026-09-02 local pre-push lint-gate alignment changes developer tooling
only. It does not change any RPC path, request envelope, response shape,
authentication rule, or API behavior.

## Profile and tutor-onboarding validation (2026-08-31)

Profile and tutor-onboarding field validation is client-side presentation logic.
Selia field parts remain nested under their `Field` roots, including checkbox
copy and section-level errors, so validation renders inline without a runtime
exception. No RPC path, request envelope, response shape, schema, or persistence
contract changed.

The tutor profile editor uses the authenticated shell's page-level vertical
scroll container, matching the student profile and avoiding a nested form
scrollbar. Direct shell children do not flex-shrink, so the tutor page wrapper
and onboarding content share one natural height. Category fieldsets use their
own content height and the action bar
stays in normal document flow without adding trailing scroll space. This is
presentation-only; no RPC path, request envelope, response shape, schema, or
persistence contract changed.

The tutor onboarding editor uses a shared responsive label/description-left,
control-right layout for profile, teaching setup, payout, evidence, education,
achievement, and experience fields. Teaching setup and payout are presented as
one full-width sequence, teaching-capacity selectors and base-honorarium
steppers fill their control column, profile-photo editing lives inside Public
profile, and specialization choices use one vertical list. Dynamic entry delete
actions use a dedicated right-aligned row.
This is presentation-only; no RPC path, request envelope, response shape,
schema, or persistence contract changed.

All roles use Better Auth `user.name` as the canonical visible name. Tutor
onboarding sends a changed single **Name** field as the transport-only
`displayName` input to `tutor.updateMyProfile`, allowing the service to update
`user.name` and its audit entry atomically; it does not persist a second
`tutorProfile.displayName` value. Discovery keeps its compatible `displayName`
response key but projects that value from `user.name`. The legacy
tutor-profile column remains accepted for compatibility and is not used as a
separate visible-name source by new web UI.

## Tutor Terms of Service acceptance (2026-09-02)

The tutor profile action area presents one bilingual consent checkbox labeled
**I agree to the Tutor Terms of Service**. The adjacent **Read terms** action
opens the Indonesian/English document in a read-only dialog. Saving a draft
remains available without accepting the terms; the tutor must check the
agreement box before the client sends `tutor.submitForReview`, and the
review-submit actions remain disabled until that box is checked.

Acceptance is enforced server-side and recorded once on `tutor_profile` with
`termsOfServiceAcceptedAt` and `termsOfServiceVersion` (`2026-09`). The
acceptance write and the `pending_review` status transition share the same
transaction. Subsequent submissions, including `changes_requested` revisions,
do not need to send the acceptance again. The acceptance metadata is excluded
from public tutor-discovery projections. After acceptance, the profile action
area keeps the consent checkbox checked and disabled while **Review Tutor
Terms** reopens the current document in the same read-only dialog. The consent
row and action buttons stack and wrap on narrow viewports so the terms control
never forces horizontal overflow.

## Tutor profile drawers (2026-08-31)

The student tutor-discovery drawer opens as a swipe-down bottom sheet below the `sm` breakpoint and a right-side drawer at `sm` and above. Its header/action regions stay outside the scroll container while `Drawer.Content` owns the single vertical scroll region for long profile content. The admin tutor review page keeps its review actions visible in the page layout while its content remains usable at narrow widths. This is client-side presentation only; no RPC path, request envelope, response shape, schema, or persistence contract changed.

The create-booking surface at `/tutors/:tutorId/book` reuses that same drawer
through a **View tutor profile** action beside the booking heading. Closing it
returns to the still-mounted booking form, and the drawer shows **Back to
booking** instead of a duplicate booking CTA. This is presentation-only and
does not add an RPC path or change the `tutors.getProfile` contract.

## Stable collection transitions (2026-08-28)

The admin tutor tables, tutor discovery list, and admin booking queue retain
their previous successful collection while the next query is loading;
pagination scrolls to the selected table card by DOM ID. Achievement and room
tables use the server-backed contracts documented below, while the admin
booking queue and wallet ledger use cursor pagination. No URL search parameter
is added for table pagination.

Booking-list UI note: `/bookings` uses Needs action, Upcoming, Series, History, and All tabs. Admins default to All; students and tutors default to Upcoming unless the URL specifies another view. The selected tab is sent to `booking.listMine` as `view`, so every cursor page is filtered server-side and the returned role-scoped facet counts are exact. URL-backed Recommended, Soonest, and Latest sorting remains client-side within loaded filtered pages. Changing tabs immediately updates the selected control and shows the content loader while the new first page loads; **Load more bookings** appends the selected view's next cursor.

Booking-card timing note: list rows already include the booking `deadlineAt` column. The web client uses it for pending response countdowns and uses scheduled start/end times for Today, Starts in, Starting soon, and In progress labels. It never derives response windows from `createdAt` and does not infer an Expired lifecycle state before the server transitions it.
The list presentation places the timing chip after financial metadata with a divider; dashboard reuse hides the financial metadata. This remains presentation-only.

## Overview

All oRPC endpoints use **POST** method. Auth is via session cookies (Better Auth). Base path: `/rpc/{namespace}/{method}` — the path segments are the oRPC procedure keys (e.g. `POST /rpc/auth/me`, `POST /rpc/payment/createPurchase`; not the dotted identifiers used as section headers below). Request bodies must be wrapped in the `{"json": <input>}` protocol envelope. Responses are wrapped as `{"json": <data>, "meta": [...]}`. The protected Knowledge Bank file proxy is the documented exception and uses `GET`.

In production, API and frontend use separate hosts: `https://api.cogitoacademy.id` serves `/rpc`, `/api/auth`, `/health`, and `/webhooks`; `https://app.cogitoacademy.id` serves the SPA. The apex `https://cogitoacademy.id` remains the company profile and is not an API host.

The public `/health` result depends on the server's database and Redis boot
checks. When the API is linked to Coolify's bundled private PostgreSQL, set
`DB_SSL_ENABLED=false` in the API environment because that database does not
serve TLS. `DB_SSL_REJECT_UNAUTHORIZED` is only relevant when database TLS is
enabled.

Email/password sign-in and sign-up use Better Auth endpoints under `/api/auth`. The server's sign-up password-policy preflight returns 400 for malformed JSON instead of allowing a parser exception to become a 500. Public email/password signup requests a six-digit OTP before account creation, then attempts a separate welcome/onboarding email after proof-backed creation commits; existing-account verification resends and other OTP types remain verification-only. The detailed request contracts are documented below. The web client validates the email forms on the client and surfaces invalid fields with Selia's inline error state and danger outline, waits for the successful auth response and a fresh session read before entering an authenticated route, and the authenticated route guard also reads the non-cookie-cached session so role-based redirects do not briefly fall back to `/login`. If that fresh session has `emailVerified !== true`, the web client requests an email-verification OTP and routes the user to `/verify-email` before the normal role/return-path destination; this also covers legacy accounts created before verification was introduced. The validated destination is preserved after verification. This changes no successful request or response shape.

Google sign-in starts through Better Auth on the API and uses `GET /api/auth/callback/google` as the provider callback (`BETTER_AUTH_URL`), then redirects the browser to the frontend callback route supplied by the web client (`https://app.cogitoacademy.id/auth/callback`). The web client supplies `callbackURL` for an existing account and `newUserCallbackURL` for a newly-created account; both carry the validated return path, so PostHog can capture `account_signed_in` or `account_created` only after the callback identifies the user. The Google provider explicitly sends `prompt=consent`, so the Google OAuth permission screen is shown even when the account has authorized the client before. Sign-in requests Google's identity scopes only; the broader Calendar scope used by the server-side Meet integration remains a separate operator OAuth flow. In production, session cookies remain `SameSite=Strict`; Better Auth's short-lived signed OAuth state cookie is scoped to `SameSite=Lax` so a top-level `GET` callback from Google can return it for state verification. The state cookie remains `Secure`/`HttpOnly`, and the database-backed state record plus signed cookie must both validate before a session is created. This changes no endpoint input or output shape.

PostHog browser analytics is client-only. When configured, the web client captures the documented auth, booking, tutor-onboarding, lifecycle, and session-completion events, browser exceptions, and explicit `cogito-web` Logs records. The public project token and host are compile-time web values; production image builds receive them through the CD workflow. The Playwright web server uses Vite `test` mode and the disabled client when those values are absent, so analytics configuration cannot block seeded browser tests. No PostHog event changes an RPC request, response, schema, or persistence contract.

Production and staging server bootstrap also reconcile `ADMIN_EMAILS` before
serving traffic (default: `itcogitoacademy01@gmail.com`). Matching addresses
are compared case-insensitively and promoted to `admin`; existing admins are
never demoted. A matching account created after boot is promoted by the Better
Auth signup hook. This is operational role initialization, not a new RPC or
auth request/response field; other admins can still be managed through the
existing admin role-management flow.

The web dashboard mostly composes existing procedures: the shared booking list uses protected `booking.listMine` for student, tutor, and admin visibility (with admin seeing all bookings), while tutor discovery remains student-only (`tutors.listPublished`) and tutor/admin dashboards compose their remaining role-specific procedures. The admin dashboard's Business insights section additionally calls the admin-only `admin.getDashboardAnalytics` aggregate procedure for 7/30/90-day WIB metrics and a live booking-state portfolio. Student and tutor next-lesson sections derive the nearest future non-terminal, non-pending item client-side and reuse the booking-list card; the tutor dashboard's above-the-fold ordering of welcome/setup, review requests, and next lesson is presentation-only. Student and tutor welcome cards also share one frontend visual component with role-specific copy and links. The booking status switcher is a page-local semantic button tablist using Selia color and elevation tokens, without the shared sliding indicator. On narrow screens, sorting appears in the wrapping header action row and the rounded tab strip directly precedes the content while its inner list remains horizontally scrollable. On larger screens, sorting remains beside the tabs. These are presentation-only details except for the documented admin analytics read.

The authenticated `/guide` (`How Cogito Works`) route is frontend-only. Its typed journey content is bundled with the web app, is role-filtered in the route UI, and adds no RPC procedure, request input, response output, or persistence contract. The responsive Selia hero, sticky desktop/horizontal mobile chapter index, collapsible step cards, and bold timing callouts are presentation-only; the callouts restate existing 7-day, 12-hour, H-2, 15-minute, 24-hour, meeting-retry, and support-SLA rules.

The global route pending loader is also presentation-only. It composes the local Selia `Spinner` with a token-based loading ring and label for route, onboarding, and auth loading states, adding no RPC procedure, request input, response output, or persistence contract.

The authenticated shell's Light/Dark/System theme menu and its `D` keyboard shortcut are frontend-only. Pressing `D` outside editable fields toggles the rendered light/dark mode through `next-themes`; it adds no RPC procedure, request input, response output, or persistence contract.

The shared empty-state presentation is also frontend-only. Empty collections, filtered no-match results, and embedded no-data sections are rendered by `apps/web/src/components/empty-state.tsx` with density and tone variants; this changes no RPC procedure, request input, response output, or persistence contract.

The browser-native control refactor is presentation-only: Selia `Textarea`, `NumberField`, `DatePicker`, and minute-level time controls do not add or change an RPC procedure, input schema, output shape, or persistence contract. This includes the Tutor Payouts custom report range, whose start/end values still map to the existing ISO date filters. Shared text-entry controls use an explicit 16px font size below the `lg` breakpoint to prevent mobile focus zoom, then use the tokenized `text-base` size from `lg` upward. The availability range separator is visual only; time suggestions may render wider than their compact input, and modality triggers preserve their icon-label row without changing the weekly range payload. Portal-based date and select popups render above dialog layers so modal forms remain interactive.

## Authenticated Editorial Content (`content.*`)

Sanity is queried only by the API server. The browser receives normalized content through protected procedures; Knowledge Bank asset URLs are intentionally omitted from list responses.

### `content.listCompetitions`

- **Auth:** Protected
- **Input:** None
- **Output:** `[{ id, title, description, location, categories: [{ id, name, coreCategory }], educationLevels, startDate, endDate, scale, organizer, registrationDeadline, registrationLink, socialMediaLink }]`
- **Description:** Returns published competition calendar entries with English projections for every authenticated role. The app route is `GET /calendar` in the SPA; the read-only UI presents the data in month and flat 30-day agenda-list views and opens a responsive details modal without changing this API contract. The agenda list includes each competition overlapping the selected period once and orders entries by first event date. The route uses a contained viewport layout so the calendar body handles vertical scrolling and the month grid handles horizontal scrolling. Month-view multi-day events retain a stable vertical lane within each week, with lanes reused only after an event ends. The month view keeps the normal grid visible when the selected month has no events; the page-level empty state still applies when no competitions are returned at all and keeps its calendar glyph in the Cogito orange accent.

### `content.listStudentResources`

- **Auth:** Protected (student, tutor, or admin)
- **Input:** None
- **Output:** `{ items: [{ id, title, description, category }], access: { eligible, balance, threshold, overrideExpiresAt? } }`
- **Description:** Returns published Knowledge Bank metadata for the authenticated `/knowledge-bank` app route. Students must meet the 35-Mark total-balance threshold (held Marks count toward eligibility), unless they have an active admin grant; below both conditions, `items` is empty and the access state explains the lock. Tutors and admins are eligible regardless of wallet balance. `overrideExpiresAt` is returned only while a student grant is active. `category` remains the Sanity slug in the API response; the web UI maps known slugs and title-cases hyphenated or underscored slugs for display while retaining the raw value for filtering. Preview presentation is frontend-only: an unsandboxed native PDF iframe opens in a bottom drawer on mobile and a right-side drawer on desktop.

### `GET /content/knowledge-bank/:resourceId/file`

- **Auth:** Student with current total balance at or above the threshold or an active admin grant, Tutor, or Admin
- **Input:** `resourceId` path parameter
- **Output:** Streamed Sanity file, normally `application/pdf`
- **Description:** Revalidates the student/tutor/admin role and Knowledge Bank eligibility, resolves the asset server-side, and streams it with `Cache-Control: private, no-store`. Its CSP permits framing only from configured app origin for the PDF preview; the production web CSP also allows the API origin in `frame-src`, while other API routes remain non-frameable. Tutors and admins bypass the student wallet threshold; students with an unexpired admin grant bypass it until the stored expiry timestamp. This is an Elysia file route, not an oRPC procedure.

### Verification

CI runs one lcov-producing API integration/unit suite together with the env,
auth, and database package tests, followed by the server suite in a separate
process because its webhook test uses `mock.module`. The previous duplicate
uninstrumented API pass is intentionally omitted. Pull-request typecheck and
build jobs use Turbo `--affected` with full history; manual runs use the full
graph. The coverage gate requires 100% coverage for `packages/api` lines,
overall lines, functions, and branches; a file set with no instrumented
branches is reported as 100% for that metric. Coverage is reported from the
same lcov artifact used by `.github/scripts/coverage-comment.ts`, and a
coverage test-command failure is propagated after the comment/gate step. Its
PR output uses blank-line-separated Markdown blocks so GitHub renders the
summary and per-file sections as tables.

### Auth Levels

| Level       | Description                                           |
| ----------- | ----------------------------------------------------- |
| `public`    | No auth required                                      |
| `protected` | Requires authenticated session                        |
| `student`   | Requires authenticated session with `role: "student"` |
| `admin`     | Requires authenticated session with `role: "admin"`   |
| `tutor`     | Requires authenticated session with `role: "tutor"`   |

---

## System

### `healthCheck`

- **Auth:** Public
- **Input:** None
- **Output:** `"OK"`
- **Description:** Returns OK if server is running

### `GET /health`

Production CD verifies this endpoint's `version` against the target commit after invoking the configured Coolify deployment webhook. The CI/CD implementation is restored to its last known successful `bb1ccb9a` state; the VPS runner does not pull application images itself.

- **Auth:** Public
- **Input:** None
- **Output:** `{ status: "ok" | "degraded" | "error", checks: { database, redis, scheduler?, dlq }, dlqDepth, timestamp, version }`
- **Description:** Readiness + alerting probe. `database` (SELECT 1 <1s),
  `redis` (ping <1s), and `scheduler` (Redis reachability — the BullMQ
  jobs ride the same Redis) feed the overall status (`degraded`→503,
  `error`→503). `checks.dlq` + `dlqDepth` are **alert-only** and never flip
  the overall status. `dlqDepth` counts **fresh** DLQ failures only: entries
  in the `cogito:dlq` ledger whose `failedAt` (epoch ms, stamped at push
  time since 2026-08-31) is within the freshness window — `DLQ_FRESH_WINDOW_MS`
  (24h default, overridable via the `DLQ_FRESH_WINDOW_HOURS` env var, invalid
  values fall back to 24h). Ledger entries without `failedAt` (the
  pre-2026-08-31 ledger) and non-JSON entries are treated as stale and never
  count, so a stale list no longer trips the monitor forever; the full
  ledger stays in Redis for inspection. `dlqDepth === -1` means depth could
  not be determined (Redis unreachable during the check). `version` is the
  deployed image sha (`GIT_SHA`, `"dev"` when unset) and the CD pipeline
  polls until it matches the merged commit.

### `GET /metrics`

- **Auth:** Bearer `METRICS_TOKEN` (`Authorization: Bearer <token>`).
  Missing/incorrect token → `401 Unauthorized`; unset `METRICS_TOKEN` → `404`.
- **Output:** Prometheus text exposition (`Content-Type: text/plain; version=0.0.4`)
- **Description:** Scraped by Prometheus every 15s (Bearer from the vault).
  Emits `http_requests_total{path,method,status,instance}` (counter),
  `http_request_duration_ms_bucket/sum/count{path,method,status,instance,le}`
  (histogram, ms buckets `5…10000` + `+Inf`), `dlq_fresh_depth{instance}`
  (gauge — fresh DLQ failures within the freshness window, `-1` when unknown),
  and `breaker_state{name,instance}` (gauge — `0`=closed, `1`=half-open,
  `2`=open per Redis-backed circuit breaker), and `app_info{version,instance}`
  (gauge — always `1`, `version` is the deployed `GIT_SHA` or `"dev"`).
  Every series carries
  `instance="single"`: the endpoint reports this process only; aggregating
  across replicas is an explicit multi-replica follow-up, not solved here.

---

## Auth (`auth.*`)

### `auth.me`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ user, profile, tutorProfile?, wallet }`
- **Description:** Returns current user with profile and wallet (lazily creates wallet)

The auth endpoints do not grandfather existing users by changing `emailVerified`. The web sign-in handoff applies the same verification requirement to new and legacy unverified users; the OTP is requested through Better Auth's `/api/auth/email-otp/send-verification-otp` endpoint and completed through `/api/auth/email-otp/verify-email`.

The default web post-login destination is role- and onboarding-aware. A tutor
without a profile, or with `draft`/`changes_requested` onboarding status, goes
to `/profile`; a tutor whose onboarding has moved into review, approval,
publication, or suspension goes to `/dashboard`. Admins and students default to
`/dashboard`. A validated `redirect` query remains an explicit return path.
Email/password and Google sign-in carry the selected destination through
`/verify-email` when email verification is still required. This is frontend
routing behavior and does not add an RPC or persistence contract.

### `auth.getProfile`

- **Auth:** Protected
- **Input:** None
- **Output:** `StudentProfileRow`
- **Errors:** `NOT_FOUND` when the authenticated student has not created a profile row yet
- **Description:** Returns only the authenticated student's profile. The student `/profile` page uses this focused procedure and treats `NOT_FOUND` as an empty editable profile; the aggregate `auth.me` procedure remains available for role-aware surfaces that need wallet data.

### `auth.updateProfile`

- **Auth:** Protected
- **Input:** `{ phoneNumber?, schoolName?, gradeLevel?, parentName?, parentPhone?, parentEmail?, allowContactRequests? }`
- **Output:** `{ user, profile }`
- **Description:** Creates or updates the authenticated user's student profile fields
- **Account identity:** The student profile page also uses Better Auth `updateUser` to update the signed-in user's `name` and optional `image`; email remains read-only on this surface. The student UI selects a JPG/PNG/WebP file, crops it to a square in the browser through a circular drag/zoom editor, uploads the resulting JPEG through `upload.createUploadUrl`, and sends the returned `publicUrl` to Better Auth only when the account details are saved.

### `auth.searchStudents`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F16)
- **Input:** `{ query, limit? }` (`query` 2–100 chars, `limit` 1–10 default 5)
- **Output:** `[{ id, name, image }]` — up to 10 students matching a name or email, excluding the requester
- **Description:** Student-only debounced lookup used by the group-booking invite UI. Email is accepted as a server-side search key but is never included in the result; the UI shows only the student's name and photo.

---

## Contact (`contact.*`)

Contact exchange is deliberately a one-way, consent-based flow. It is available
only between eligible student participants of the same completed group booking;
tutors, admins, outsiders, absent participants, and incomplete bookings cannot
use these procedures. There is no direct-chat surface in this flow.

### `contact.listForBooking`

- **Auth:** Student
- **Input:** `{ bookingId }`
- **Output:** `{ bookingId, items: [{ userId, name, image, canRequest, request }] }`
- **Description:** Lists the other eligible student participants with a safe identity projection. `request` is `null` until a request exists; its projection contains `{ id, direction, status, message, emailShared, email, createdAt, respondedAt }`. `email` is always `null` for incoming requests and pending/declined requests. It is populated only for the requester after the recipient explicitly chooses `accept_share_email`. Phone numbers and chat messages are not exposed.

### `contact.request`

- **Auth:** Student
- **Input:** `{ bookingId, recipientId, message? }` (`message` max 200 characters)
- **Output:** `{ bookingId, userId, request }`
- **Description:** Creates one request to an eligible peer from a completed shared booking. The recipient's `allowContactRequests` profile setting is checked server-side. The recipient receives an in-app notification containing only the requester's name, optional note, and request/booking IDs; no email is copied to notification metadata, notification bodies, or email dispatch.
- **Errors:** `NOT_FOUND` when the booking or viewer is not available, `BAD_REQUEST` when the booking is incomplete, the peer is not eligible, or the recipient has opted out, `CONFLICT` when a request already exists

### `contact.respond`

- **Auth:** Student (the request recipient only)
- **Input:** `{ requestId, decision }`, where `decision` is `accept_share_email`, `accept_without_email`, or `decline`
- **Output:** `{ bookingId, userId, request }`
- **Description:** Applies the recipient's explicit decision. `accept_share_email` reveals the recipient's account email only to the original requester on a later contact read; `accept_without_email` records acceptance without disclosure; `decline` rejects the request. The recipient's response never returns their email through the incoming request projection.
- **Errors:** `FORBIDDEN` when a non-recipient responds, `NOT_FOUND` for an unknown/unavailable request, `BAD_REQUEST` when the booking is no longer completed or a participant is no longer eligible, `CONFLICT` for an already-answered request

---

## Password Reset (Better Auth — `/api/auth/*`)

Not part of the oRPC namespace. Mounted under `/api/auth` on the Elysia server.

### `POST /api/auth/request-password-reset`

- **Auth:** Public
- **Input:** `{ email, redirectTo? }`
- **Output:** `200 { status: true }` — identical for known and unknown emails (no enumeration)
- **Description:** Sends a reset email (category `auth`, via `setAuthEmailSender`). Link = `{BETTER_AUTH_URL}/reset-password/{token}?callbackURL={redirectTo}`. Rate-limited (10/min per IP, same limiter as other auth endpoints). Token valid 1 hour.

### `GET /api/auth/reset-password/{token}`

- **Auth:** Public
- **Description:** Validates token, redirects to `callbackURL?token=<token>` or `callbackURL?error=INVALID_TOKEN`.

### `POST /api/auth/reset-password`

- **Auth:** Public
- **Input:** `{ newPassword, token }`
- **Description:** Sets new password. Revokes all existing sessions (`revokeSessionsOnPasswordReset: true`). Used tokens are invalidated (replay fails).

### Frontend routes

- `/forgot-password` — email request form (always shows success state after submit)
- `/reset-password` — token entry + new password form; renders invalid/expired state on `error=INVALID_TOKEN`

## Pre-account email signup verification (REQ-AUTH-01)

These Better Auth HTTP endpoints are mounted on the API under `/api/auth`; they
are not oRPC procedures. A public account is created only after the signup OTP
is valid for the submitted email and signup attempt.
The custom signup, OTP-send, and outcome POST routes require an allowed browser
`Origin` or `Referer` under the configured frontend-origin policy. Better
Auth's email-OTP plugin has `disableSignUp: true`; its sign-in OTP routes cannot
send a code to or create an unknown account.

### `POST /api/auth/sign-up/email-otp`

- **Auth:** Public
- **Input:** `{ email, signupAttemptId }`, where `signupAttemptId` is a client-generated UUID
- **Output:** `200 { ok: true, signupAttemptId, resendAfterSeconds: 60 }`
- **Errors:** `400` for an invalid email or attempt ID; `403` for a missing or untrusted browser origin; `429` during the 60-second per-email cooldown (includes `Retry-After` and `retryAfterSeconds`, plus the attempt ID only when it matches the caller's submitted ID); `502` when the mail provider fails
- **Behavior:** Commits the proof and cooldown in a short transaction, then sends a six-digit code that expires in five minutes outside the transaction and email lock. If delivery fails, the server deletes only the proof row created by that request and returns an inline error. Resend after the cooldown replaces the stored proof and invalidates the previous code. Three incorrect submissions exhaust the attempt. The OTP is stored as an HMAC digest in the existing Better Auth `verification` table. Auth routes share a 10-request/minute/IP bucket across canonical, percent-encoded, repeatedly encoded, case-varied, and trailing-slash path forms. The browser stores only its per-address attempt ID in session storage; changing email clears the visible code and proof state, and returning to that address can recover the same attempt through its cooldown response.

### `POST /api/auth/sign-up/email`

- **Auth:** Public; the normal email/password sign-in and session response is preserved
- **Input:** `{ name, email, password, signupAttemptId, otp }`
- **Output:** The Better Auth signup response with the newly created user and session on success
- **Errors:** `400` without proof or with an incorrect/expired code; `403` for a missing or untrusted browser origin; `409` for an existing account or already-completed attempt; `429` after three incorrect codes; otherwise the underlying Better Auth create error
- **Behavior:** Raw signup without both proof fields fails. Account creation, proof consumption, and the attempt outcome record commit in one PostgreSQL transaction; a failed create rolls back and leaves the proof usable until expiry or resend. Concurrent requests for the same email/attempt can create at most one account and one welcome-email attempt. After commit, the browser establishes the returned session as with existing sign-in flows.

### `POST /api/auth/sign-up/email-outcome`

- **Auth:** Public
- **Input:** `{ email, signupAttemptId }`
- **Output:** `{ created: boolean }`
- **Errors:** `403` for a missing or untrusted browser origin
- **Behavior:** Returns `true` only for the completed attempt bound to the exact normalized email. The result record expires after 24 hours; a cooldown response never discloses a different caller's attempt ID. The web client checks this endpoint after a network-uncertain signup response and asks the user to sign in if the account committed without a browser session; it does not replay signup.

### Local test-only OTP capture

`GET /api/__test/auth/signup-otp?email=...` exists only when `NODE_ENV=test`
and the server is connected to loopback PostgreSQL database `cogito-test` on
port `6767` or `6768`. It also requires a loopback request peer and loopback
Host. The route reads an in-memory test capture; test signup mail is suppressed.
It is not registered for production or ordinary development and must not be
used to retrieve production OTPs.

---

## Admin (`admin.*`)

### `admin.getDashboardAnalytics`

- **Auth:** Admin
- **Input:** either `{ period?: "7d" | "30d" | "90d" }` (default `"30d"`) or `{ dateFrom: "YYYY-MM-DD", dateTo: "YYYY-MM-DD" }`; custom dates are inclusive WIB days, cannot be combined with `period`, are capped at 366 days, and reject impossible calendar dates
- **Output:** `{ period, periodStart, periodEnd, summary, businessSummary, bookingTrend, userTrend, stateBreakdown, modalityBreakdown, categoryBreakdown }`
- **Description:** Returns aggregate data used by admin Business insights. Selected-range metrics use WIB calendar boundaries; booking counts use booking creation time and include every booking state. `summary.pricingSnapshotBreakdown` is `{ v3, legacy, other, missing }` and counts parent booking records, not sessions or financial value. `v3` uses the `engine: "v3"` tag; `legacy` requires an untagged object with numeric `perStudent`, `baseline`, `tutorShare`, and `cogitoTake`; `other` covers unknown engine tags and non-null snapshots that do not match the known legacy shape; `missing` is SQL `NULL`. Booking-derived Marks, IDR, and platform-share totals are omitted until their booking, participant, session, and date basis is defined. Top-up revenue remains based on successful payment and refund records: `businessSummary.signups`, `grossRevenueIdr`, `refundedIdr`, and `netRevenueIdr` follow the selected range, with successful payment `updatedAt` as the available settlement-time proxy. Total accounts, student/tutor totals, current Marks ownership, and lifetime paid conversion are snapshots independent of the selected range. MAU counts unique accounts with auth-session activity in the latest rolling 30 days. Inactive users are accounts older than 30 days without such activity. Churn compares users active 31-60 days ago against those absent in the latest 30 days, so it is session-based operational churn rather than product-event retention. `summary.activeLearners` remains a distinct booking-proposer count. `stateBreakdown` is the live all-bookings state mix; modality/category breakdowns use the selected range; missing trend days are zero-filled.

### `admin.listUsers`

- **Auth:** Admin
- **Input:** `{ limit?, offset? }` (`limit` default 50)
- **Output:** `{ users: User[], total, limit, offset }`
- **Description:** Paginated user list

### `admin.searchUsers`

- **RPC path:** `/rpc/admin/users/search`
- **Auth:** Admin
- **Input:** `{ query, limit? }` (`query` is trimmed and must contain at least 2 characters; `limit` defaults to 10 and is capped at 20)
- **Output:** `UserSearchResult[]` where each result is `{ id, name, email, image, role }`
- **Description:** Case-insensitive partial lookup for admin support workflows. Matches `name`, `email`, or `id`; exact email/ID matches are ranked first. Wildcard characters are treated literally. The wallet lookup UI uses the selected result's `id` with `admin.getWallet` and `admin.listLedgerEntries`; the Knowledge Bank access form filters the same bounded result set to students and uses the selected email for a grant.

### `admin.setRole`

- **Auth:** Admin
- **Input:** `{ userId, role, expectedRole }`
- **Output:** `{ user }`
- **Errors:** `USER_NOT_FOUND` (404), `LAST_ADMIN` (409), `OPTIMISTIC_LOCK` (409)
- **Description:** Changes user role; prevents removing last admin; optimistic lock via `expectedRole`

### `admin.getWallet`

- **Auth:** Admin
- **Input:** `{ userId }`
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Returns any user's Marks wallet (G9)

### `admin.listLedgerEntries`

- **Auth:** Admin
- **Input:** `{ walletId?|userId?, limit?, cursor?, bookingId?, entryType?, dateFrom?, dateTo? }` (`entryType` one of credit/hold/release/deduct/compensate_credit/compensate_deduct)
- **Output:** `{ items: LedgerEntry[], nextCursor }`
- **Errors:** `INVALID_LEDGER_FILTER` (400) — walletId and userId are mutually exclusive; exactly one required
- **Description:** Paginated ledger for any wallet, filterable by type, date range, or booking

### `admin.getTutorPayouts`

- **Auth:** Admin
- **Input:** `{ tutorId, dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (`tutorPayoutIdr` sums persisted fee-event honoraria plus the legacy snapshot fallback for sources without a fee event)
- **Errors:** `INVALID_LEDGER_FILTER` (400) — invalid date
- **Description:** Internal tutor payout summary. Persisted `tutor_session_fee` events are authoritative for recorded deliveries; legacy payout-eligible booking/session snapshots without an event, including explicit no-show eligibility, use the compatibility adapter. Event keys prevent fee-event/legacy double counting, including a completed series child whose parent is still scheduled. With no date filters this is all-time; use `admin.getPendingTutorPayouts` for the amount after the latest paid cutoff. New fee events use `earnedAt` for that cutoff, while legacy sources retain the existing completion-time/scheduled-time fallback. Payout report rows remain aggregate transfer headers; `admin.getTutorPayoutAllocations` returns the session-level sources recorded for new paid batches. Historical batches are not backfilled. `totalMarks` reports the internal split basis (`priceSnapshot.baseline`), so `totalMarks === cogitoTake + tutorPayout`; per-student rounding surpluses (`actualMarksPooled ≥ baseline`) are not included.

### `admin.getTutorPayoutReport`

- **HTTP:** `POST /rpc/admin/getTutorPayoutReport`
- **Auth:** Admin
- **Input:** `{ dateFrom?, dateTo? }` (ISO datetimes; both are optional)
- **Output:** `TutorPayoutReportRow[]`; rows include payout status, covered-session count, gross, saved tax status/rate/source/withholding, transfer fee, calculated net, actual amount/reference/proof, transfer-recorded actor/time, and reconciliation fields. New paid/void rows use saved tax and bank snapshots. Legacy aggregate rows retain nullable snapshots and never fall back to current identity/bank data; admin history labels absent coverage and tax snapshots as unavailable instead of showing numeric zero.
- **Description:** Returns paid and void transfer history in the requested Asia/Jakarta date window plus each tutor's current unpaid summary. Current unpaid sessions remain visible outside the selected history window. NIK/NPWP and bank details are admin-only fields; this procedure requires the admin role.

### `admin.getPendingTutorPayouts`

- **Auth:** Admin
- **Input:** `{ tutorId }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr, items, lastPaidAt }`; each `items[]` entry includes `{ sourceKey, sourceType, tutorSessionFeeId, bookingId, bookingNumber, bookingSessionId, bookingType, deliveryStatus, scheduledStartAt, earnedAt, grossHonorariumIdr, priceSnapshot }`.
- **Description:** Returns unpaid fee-event sources and the legacy compatibility summary. New source-based payouts are excluded through their per-session allocations; the historical cutoff applies only to true allocationless aggregate rows, including older T02 rows identified by their allocation records even when preview fields are NULL. Sources on a void payout with reconciliation required stay unavailable after its allocations are released. An allocationless legacy payout voided with transfer reconciliation required retains its cutoff until audited resolution, after which the prior paid legacy cutoff still applies. A prepared batch reserves its exact sources. Existing published tutors can continue teaching while tax identity is incomplete, but a new batch cannot be prepared until legal name and a 16-digit NIK are present.

### `admin.getTutorPayoutAllocations`

- **HTTP:** `POST /rpc/admin/getTutorPayoutAllocations`
- **Auth:** Admin
- **Input:** `{ payoutId }` (UUID string)
- **Output:** `{ detailsAvailable, items }`; each item includes the persisted fee/source identity, booking/session, delivery status, gross snapshot, and whether the allocation remains active or was released with a reason.
- **Description:** Returns the saved per-session allocations for a prepared, paid, or void payout. Historical aggregate-only rows return no items; the admin and tutor history views identify unavailable coverage and tax snapshots without inferring or fabricating historical detail.

### `admin.previewTutorPayout` and `admin.prepareTutorPayout`

- **HTTP:** `POST /rpc/admin/previewTutorPayout` and `POST /rpc/admin/prepareTutorPayout`
- **Auth:** Admin
- **Preview input:** `{ tutorId, sourceKeys }`; output includes a SHA-256 `previewVersion`, exact selected sources, current profile/config versions, tax snapshot, one transfer fee, saved destination fields, and net.
- **Prepare input:** `{ tutorId, sourceKeys, previewVersion, operationId }`; output is the immutable prepared payout header. `operationId` is a UUID idempotency key.
- **Description:** Preparation revalidates fee sources, tutor profile, bank destination, tax configuration and preview version in a transaction. It reserves the selected sources atomically; active allocations and tutor locks prevent two admins from reserving the same source. Tax is rounded to whole IDR from basis points; exact bank name `BCA` has no fee and other banks incur Rp2,500 once per batch. Negative net is rejected.

### `admin.recordTutorPayoutTransfer`

- **HTTP:** `POST /rpc/admin/recordTutorPayoutTransfer`
- **Auth:** Admin
- **Input:** `{ payoutId, previewVersion, actualAmountIdr, paidAt, reference?, proofUrl? }`; `proofUrl` must be HTTP(S).
- **Output:** Saved payout mutation result with actual amount/date/reference/proof and transfer-recorded actor/time.
- **Errors:** `PAYOUT_PREVIEW_STALE`, `PAYOUT_AMOUNT_MISMATCH`, `TUTOR_PAYOUT_STATE_INVALID`.
- **Description:** Records only an externally performed transfer. The actual amount must exactly equal the saved net. Current profile/rate/fee sources are revalidated before commit. Repeating the complete normalized transfer input for an already-paid row returns its saved result; conflicting replays are rejected without another audit or notification. The payout, audit, tutor notification and email outbox row commit together; this procedure does not execute a bank transfer.

### `admin.voidTutorPayout` and `admin.resolveTutorPayoutReconciliation`

- **HTTP:** `POST /rpc/admin/voidTutorPayout` and `POST /rpc/admin/resolveTutorPayoutReconciliation`
- **Auth:** Admin
- **Input:** `{ payoutId, reason }` for either procedure.
- **Output:** Saved payout mutation result.
- **Description:** Voiding preserves the payout, allocation and any external-transfer evidence while recording actor/time/reason. Allocations are released. If transfer evidence exists, the source fees stay blocked from repayment until an audited reconciliation resolution is recorded.

### Tutor tax defaults and overrides

- **HTTP:** `POST /rpc/admin/getTutorTaxConfig`, `/rpc/admin/updateTutorTaxConfig`, `/rpc/admin/setTutorTaxRateOverride`
- **Auth:** Admin
- **Inputs:** Update defaults with `{ expectedVersion, nikNpwpRateBps, nikOnlyRateBps, missingRateBps, reason }`; set/clear a tutor override with `{ tutorId, rateBps, reason }` (`rateBps: null` clears it).
- **Output:** Current versioned defaults or `{ tutorId, taxRateOverrideBps }`.
- **Description:** Defaults start at 250 bps (2.50%) for NIK+NPWP, 300 bps for NIK-only and missing identity. Admin changes and tutor-specific overrides require a reason and are audited. These configurable defaults are not legal validation; tax-adviser confirmation remains OPS01.

### `admin.getEconomySettings`

- **Auth:** Admin
- **Input:** None
- **Output:** `{ id, markValueIdr, minTutorBaseRateIdr, onlineTutorIncrementIdr, offlineTutorIncrementIdr, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr, version, updatedBy, createdAt, updatedAt }`
- **Description:** Returns the active Marks computational value and the online/offline tutor and Cogito schedules used for new booking snapshots.

### `admin.updateEconomySettings`

- **Auth:** Admin
- **Input:** `{ expectedVersion, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr }` (IDR values use Rp5,000 increments; bases are at least Rp5,000; increments are non-negative)
- **Output:** The updated economy settings object; `version` increments only when at least one schedule value changes
- **Errors:** `ECONOMY_CONFIG_CONFLICT` (409) when `expectedVersion` is stale; validation errors (400) for unsupported values
- **Description:** Updates the active Cogito take schedule, records an audit event, and affects only future bookings and new repricing snapshots. Existing booking snapshots remain unchanged. The update does not notify tutors; their IDR honorarium settings and the student-facing Marks preview remain separate concerns. Saving identical values is a no-op and creates no new audit event or notification.

### `admin.listAcademyClasses`, `admin.getAcademyClass`, `admin.saveAcademyClassDraft`

- **RPC paths:** `/rpc/admin/listAcademyClasses`, `/rpc/admin/getAcademyClass`, `/rpc/admin/saveAcademyClassDraft`
- **Auth:** Admin
- **Inputs:** list `{ state?: "draft" | "published" | "postponed" | "cancelled" | "completed" }`; get `{ id }`; save uses a `kind`-discriminated class payload. Both kinds require `competitionId`, English `titleEn`/`descriptionEn`, optional Indonesian fields, optional `coverKey`, `tutorFeeIdr`, `sessions[]`, and an audit `reason`. Cohort adds `minimumEnrollment`, `minimumCheckAt`, `fullRateMarks`, `halfRateMarks`, and `singleRateMarks`; masterclass adds `masterclassRateMarks` and must contain exactly one session. Each session has optional stable `id`, `capacity`, English title, optional Indonesian title/curriculum, ISO `startAt`/`endAt`, `mode` (`online` or `in_person`), `tutorId`, and `roomId` only for in-person delivery. Updates additionally require class `id` and `expectedVersion`.
- **Output:** Admin class/session rows with competition, tutor, and managed-room labels. Save returns the saved class and ordered sessions.
- **Rules:** New rows are drafts only. Competition must be active; each tutor must have a published profile that supports the mode and session capacity; in-person sessions require an active room large enough for that session. Cohorts require English curriculum text, a minimum-check date before the first session, and non-overlapping sessions; masterclasses have exactly one session. Draft updates preserve submitted session IDs and use optimistic version checks; only drafts are editable. Create/update writes an audit entry with actor, reason, and before/after snapshot. The admin editor uploads PNG/JPEG/WebP/GIF covers (max 5 MB) through `upload.createUploadUrl` and saves the returned key as `coverKey`; approved class assets remain pending. Drafts are not public and do not reserve rooms.
- **Rate defaults:** Cohort full/half/single prices default to 20/22/25 Marks per session; tutor fee is fixed at Rp400,000 per session in either delivery mode. Masterclasses default to 5 Marks and Rp300,000 tutor fee. Publish rejects a changed tutor fee.
- **Errors:** `ACADEMY_CLASS_NOT_FOUND` (404); `ACADEMY_CLASS_VERSION_CONFLICT` and `ACADEMY_CLASS_STATE_CONFLICT` (409); invalid schedule/reference/class data (400).

### `admin.publishAcademyClass`, `admin.retryAcademyClassMeetings`

- **RPC paths:** `/rpc/admin/publishAcademyClass`, `/rpc/admin/retryAcademyClassMeetings`
- **Auth:** Admin
- **Inputs:** Publish `{ id, expectedVersion, reason }`; retry `{ id, reason }`.
- **Output:** Updated admin class/session rows, including per-online-session meeting status for admin reads.
- **Publish rules:** Publication locks and version-checks the draft, then takes the competition-catalog lock, sorted tutor locks, and sorted room locks before rereading current references under row locks. It revalidates active competition ancestry, published tutor assignment and capacity, approved flat tutor fee, future schedule, managed room capacity, and overlap against active bookings and other published classes. Catalog archive, tutor status changes, and room update/deactivation coordinate through the matching locks. One online-session meeting job is inserted with publication and audit writes in the same transaction; in-person sessions use managed rooms and do not create Meet work. Assigned tutors receive one deduplicated schedule notification each.
- **Meeting retry rules:** Provider work runs after publication commits and uses durable per-session jobs, a lease, exponential retries, and stable Google event IDs. If Google accepted an event but has not generated its Meet URL, the job remains failed/retryable with that event ID; retry fetches the same event rather than inserting another. A manual fallback is not reported ready. Repeated/concurrent publication cannot add duplicate jobs or notifications. Admin retry queues failed jobs; scheduled retries continue automatically. Test mode injects a controlled local adapter and never calls Google.
- **Enrollment:** Student checkout is a separate T05 API/UI slice described below; class publishing remains an admin-only operation.

### `classes.list`, `classes.get`

- **RPC paths:** `/rpc/classes/list`, `/rpc/classes/get`
- **Auth:** Public read
- **Inputs:** `list` has no input; `get` accepts `{ id }`.
- **Output:** Published class catalog fields, current published cohort/masterclass rates, competition and parent names, ordered sessions, schedule/mode/curriculum, and tutor display name. The DTO excludes tutor IDs/account data, IDR tutor fees/payout/tax data, meeting/room details, audit/version fields, and student roster data.
- **Rules:** The list filters to `published`; detail returns not found for missing or unpublished classes. Enrollment data is never included in this public read contract.

### `classes.getMyEnrollments`, `classes.createEnrollment`

- **RPC paths:** `/rpc/classes/getMyEnrollments`, `/rpc/classes/createEnrollment`
- **Auth:** `getMyEnrollments` requires the signed-in student role. `createEnrollment` requires a verified student. Tutors, admins and other students cannot read or mutate another student's enrollment.
- **Inputs:** Read `{ classId }`. Create `{ classId, requestKey, plan: "full" | "half" | "single" | "masterclass", sessionId? }`; `requestKey` is a UUID scoped to the student. A single plan requires one eligible `sessionId`; other plans select the eligible sessions on the server.
- **Output:** Read returns `{ classId, eligibleSessions, enrollments }`, scoped to the caller. Each eligible session reports `seatsAvailable` and `alreadyEntitled`; each enrollment returns its plan/state, immutable quote totals, installment summaries and per-session allocation balances. Create returns the same enrollment summary plus `outcome: "confirmed" | "checkout_pending" | "already_exists"`, wallet `availableMarks` and `shortfallMarks`.
- **Rules:** Create uses current published rates and snapshots selected future scheduled session IDs and per-session rates. Cohort full holds every selected session at the full rate; half splits remaining count with ceil/floor, charging the first half now and reserving the second half without Marks until its due session; single reserves one selected session. A masterclass requires its one scheduled session. A pending checkout reserves all selected seats for 15 minutes. The request key makes retries return the original enrollment without another hold. Active entitlements cannot be switched to another plan; after a missed half deadline, rejoin is a new quote for future sessions only.

### `classes.completeCheckout`, `classes.paySecondInstallment`

- **RPC paths:** `/rpc/classes/completeCheckout`, `/rpc/classes/paySecondInstallment`
- **Auth:** Verified student; both operations verify enrollment ownership in the service.
- **Inputs:** `{ enrollmentId }`.
- **Output:** `{ enrollment, outcome, availableMarks, shortfallMarks }`; checkout/payment outcomes are `funded`, `checkout_pending`, `defaulted`, `expired` or `insufficient`.
- **Rules:** Checkout holds the first installment from the current wallet inside the seat-allocation transaction. Insufficient balance leaves the checkout pending and returns the shortfall without a partial hold. The second installment uses the saved rate and due session; duplicate calls after funding are no-ops. At the due session start, an unpaid installment defaults and releases only its unfunded future reservations; missed sessions are not charged. Reminder jobs are idempotent and skip historical notices for late joiners.

### `classes.createTopUpQuote`, `classes.purchaseTopUp`

- **RPC paths:** `/rpc/classes/createTopUpQuote`, `/rpc/classes/purchaseTopUp`
- **Auth:** Verified student; both operations verify ownership of the associated enrollment/installment or attempt.
- **Inputs:** Quote `{ enrollmentId, ordinal: 1 | 2, requestKey }`; purchase `{ attemptId, choice: "package" | "custom" | "recommended" }`.
- **Output:** Quote returns the existing V3 top-up quote fields plus a stable `attemptId`, immutable requested shortfall Marks, quote ID, revision and expiry. Purchase returns payment ID, nullable checkout URL, status and recovery state.
- **Rules:** An attempt is keyed to one installment and request key; its shortfall amount and payment quote identity cannot be replaced on retry. The student's top-up completion credits the wallet through the existing payment flow. It does not extend an expired class seat reservation or promise re-enrollment.

## Admin Knowledge Bank Access (`adminKnowledgeBank.*`)

All routes are admin-only. Each student has at most one live grant; the expiry
is checked at read time rather than by a scheduled cleanup job.

### `adminKnowledgeBank.list`

- **RPC path:** `/rpc/admin/knowledge-bank/access/list`
- **Auth:** Admin
- **Input:** `{ search?, status?: "all" | "active" | "expired" }`
- **Output:** `KnowledgeBankAccessView[]`, where each item is `{ id, userId, studentName, studentEmail, expiresAt, note, createdAt, updatedAt, status }`
- **Description:** Lists temporary student grants, optionally filtering by student name/email and active/expired status. The admin page is `/admin-knowledge-bank`.

### `adminKnowledgeBank.create`

- **RPC path:** `/rpc/admin/knowledge-bank/access/create`
- **Auth:** Admin
- **Input:** `{ email, expiresAt, note? }`; `expiresAt` is an ISO datetime in the future and `note` is limited to 500 characters
- **Output:** `KnowledgeBankAccessView`
- **Errors:** `STUDENT_NOT_FOUND` (404), `TARGET_USER_NOT_STUDENT` (400), `KNOWLEDGE_BANK_ACCESS_GRANT_ALREADY_EXISTS` (409), `INVALID_KNOWLEDGE_BANK_ACCESS_EXPIRY` (400)
- **Description:** Finds the account case-insensitively by email and creates a temporary Knowledge Bank exception only for a student. The admin web form normally supplies this email from a selected `admin.searchUsers` result. Creation is audit-logged.

### `adminKnowledgeBank.update`

- **RPC path:** `/rpc/admin/knowledge-bank/access/update`
- **Auth:** Admin
- **Input:** `{ id, expiresAt, note? }`; `expiresAt` must remain in the future
- **Output:** `KnowledgeBankAccessView`
- **Errors:** `KNOWLEDGE_BANK_ACCESS_GRANT_NOT_FOUND` (404), `INVALID_KNOWLEDGE_BANK_ACCESS_EXPIRY` (400)
- **Description:** Changes the expiry and note while keeping the student identity fixed. The before/after values are audit-logged.

### `adminKnowledgeBank.remove`

- **RPC path:** `/rpc/admin/knowledge-bank/access/remove`
- **Auth:** Admin
- **Input:** `{ id }`
- **Output:** `null`
- **Errors:** `KNOWLEDGE_BANK_ACCESS_GRANT_NOT_FOUND` (404)
- **Description:** Removes the live exception immediately. The removal is audit-logged so the historical decision remains available to operators.

---

## Admin Mark Packages (`adminMarkPackage.*`)

All routes are admin-only. Package `code` is the stable business key used by
`payment.createPurchase`; it cannot be changed after creation.

### `adminMarkPackage.list`

- **RPC path:** `/rpc/admin/mark-packages/list`
- **Auth:** Admin
- **Input:** None
- **Output:** `MarkPackage[]` (includes inactive packages)
- **Description:** Lists the full mark-package catalog for administration, ordered by Marks and code.

### `adminMarkPackage.create`

- **RPC path:** `/rpc/admin/mark-packages/create`
- **Auth:** Admin
- **Input:** `{ code, name, marks, priceIdr, isActive? }`; `code` is a lowercase slug and `isActive` defaults to `true`
- **Output:** `MarkPackage`
- **Errors:** `MARK_PACKAGE_CODE_CONFLICT` (409)
- **Description:** Creates a package with an application-generated UUID id. The package is immediately available for purchase when active.

### `adminMarkPackage.update`

- **RPC path:** `/rpc/admin/mark-packages/update`
- **Auth:** Admin
- **Input:** `{ id, name, marks, priceIdr }`
- **Output:** `MarkPackage`
- **Errors:** `MARK_PACKAGE_NOT_FOUND` (404)
- **Description:** Updates display name, Marks, and IDR price. The package code remains immutable so existing purchase clients and payment records remain valid.

### `adminMarkPackage.setActive`

- **RPC path:** `/rpc/admin/mark-packages/set-active`
- **Auth:** Admin
- **Input:** `{ id, isActive }`
- **Output:** `MarkPackage`
- **Errors:** `MARK_PACKAGE_NOT_FOUND` (404)
- **Description:** Activates or deactivates a package without deleting it. Inactive packages are omitted from `wallet.listPackages`; an unchanged active state is a no-op.

---

## Admin Tutor (`adminTutor.*`)

### `adminTutor.inspectInvitee`

- **Auth:** Admin
- **Input:** `{ email }`
- **Output:** `{ exists, email, name, role, providers, hasGoogle, hasPassword }`
- **Description:** Checks whether an invite email already belongs to a Better Auth user and reports linked authentication providers for clear admin guidance

### `adminTutor.createInvite`

- **Auth:** Admin
- **Input:** `{ email, displayName, internalNotes? }`
- **Output:** `{ invite }`
- **Description:** Creates a tutor invite with a unique token and sends the branded tutor-onboarding email with an account-email reminder, UTC expiry, primary claim CTA, and fallback URL

### `adminTutor.listInvites`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Invite[], total, limit, offset }`
- **Frontend note:** The Manage Tutors invitation table requests three rows per page and renders `invited` as warning, `accepted` as success, and terminal `expired`/`revoked` statuses as danger; unknown values use the neutral secondary fallback. The tutor-profile table requests five rows per page.

### `adminTutor.resendInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`
- **Description:** Regenerates token and expiry for manual copy (invalidates the previous token); does not send email

### `adminTutor.sendInviteAgain`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** Invite row with a new one-time plaintext token and `emailDelivery` (`sent`/`skipped`/`failed`)
- **Description:** Explicitly rotates the invite link and sends the replacement through Resend

### `adminTutor.revokeInvite`

- **Auth:** Admin
- **Input:** `{ inviteId }`
- **Output:** `{ invite }`

### `adminTutor.listTutorProfiles`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: TutorProfile[], total, limit, offset }`
- **Description:** The Manage Tutors review UI resolves pending `subjectIds` through the active specialization taxonomy and displays category/specialization labels; the procedure continues to return the pending change payload unchanged. The focused review card derives presentation-only added/changed/removed/filled/empty states from current and pending values, exposes summary counts plus search/status filters, and renders expandable current/proposed rows while keeping `profileImageUrl` in the separate photo comparison. The separate `/admin-tutor-payouts` workspace reuses the profile list for payout-account readiness and operational transfer review.

### `adminTutor.listTutorProfileHistory`

- **Auth:** Admin
- **Input:** `{ tutorProfileId }`
- **Output:** Up to 50 newest audit entries for the tutor profile, including action, actor, timestamps, complete profile `beforeState`/`afterState` snapshots, `details.changedFields`, and photo workflow details
- **Description:** Returns complete profile-change and moderation history shown on the admin tutor review page. Each changed tutor save records one full profile snapshot pair; `details.changedFields` lists changed leaf paths. Revisions to pending proposals compare against the previous proposal; approval records include the complete post-promotion snapshot. Admin-uploaded edited assets are applied to canonical `user.image` only by an approve/publish action; requesting changes never changes the current public photo.

### `adminTutor.reviewTutorProfile`

- **Auth:** Admin
- **Input:** `{ tutorProfileId, action, adminNote?, profileImageUrl? }` (`action` one of request_changes/approve_unpublished/publish/unpublish/suspend/approve_edits/request_edit_changes; `profileImageUrl`, when present, must be an HTTP(S) URL or a generated `/uploads/...` storage path of at most 2048 characters)
- **Output:** `{ profile }`
- **Errors:** `TUTOR_PROFILE_NOT_FOUND` (404), `INVALID_INVITE_ACTION` (400) when the action is not allowed from the profile's current onboarding status (F25 state machine: publish only from `pending_review`/`changes_requested`/`approved_unpublished`; unpublish/suspend/approve_edits/request_edit_changes only from `published`; request_changes only from `pending_review`/`changes_requested`), `TUTOR_PROFILE_OPTIMISTIC_LOCK` (409) if another moderator changed the profile first

### `adminTutor.updateTutorAchievements`

- **RPC path:** `/rpc/adminTutor/updateTutorAchievements`
- **Auth:** Admin
- **Input:** `{ tutorProfileId, version, education, achievements }`; `education` accepts up to 2 `{ university, degree }` entries and `achievements` accepts up to 5 `{ competitionName, year, awards }` entries, with awards as one or more full titles
- **Output:** Updated `TutorProfile` row
- **Errors:** `TUTOR_PROFILE_NOT_FOUND` (404), `OPTIMISTIC_LOCK` (409) when `version` no longer matches
- **Description:** Lets an admin normalize education and competition copy during profile review. The update increments the profile version, records an audit event, and mirrors matching pending achievement fields when a published tutor has a pending edit proposal.

---

## Tutor (`tutor.*`)

### `tutor.getMyProfile`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile: { ..., v3FeeProjection: null | { revision, competitions: [{ slug, name, rates: [{ headcount, online, offline }] }] } } }`
- **Description:** Returns the authenticated tutor's profile. `v3FeeProjection` is `null` while the V3 activation pointer is unset. With an active revision, it contains the active IDR honorarium for online and offline sessions at headcounts 1–6, limited to the tutor's assigned parent competitions. The web app presents this tutor-owned profile editor at `/profile`; the legacy `/onboarding` URL redirects there. This route change does not alter the RPC path.

### `tutor.getMyProfileHistory`

- **Auth:** Tutor
- **Input:** None
- **Output:** Up to 50 newest audit entries for the authenticated tutor profile, including action, actor identity (`id` and display name only), actor type, timestamps, complete profile `beforeState`/`afterState` snapshots, and photo/review workflow details; account email is not returned
- **Description:** Returns tutor profile audit history for audit-capable surfaces. Each changed save includes complete profile snapshots plus `details.changedFields`; the focused tutor photo editor no longer embeds this history. Published photo replacements remain proposals until an admin approves them.

### `tutor.updateMyProfile`

- **Auth:** Tutor
- **Input:** `{ version, displayName?, shortBio?, affiliation?, achievementProofUrls?, experienceProofUrls?, profileImageUrl?, education?, achievements?, experiences?, subjectIds?, modality?, baseRatesIdr?, onlineMaxClassSize?, offlineMaxClassSize?, bankName?, bankAccountNumber?, bankAccountHolderName?, bankAccountOpeningCity?, bankAccountOwnership?: "self" | "trusted_person", bankTransferDisclaimerAccepted?, prices? }`. `displayName` is a trimmed 1–255 character canonical account name and is audited with the profile save. `affiliation` is a trimmed string of 1–255 characters when supplied. `achievements` accepts up to 5 `{ competitionName, year, awards }` entries. `experiences` accepts up to 5 `{ role, organization, startYear, endYear, description }` entries; `endYear` may be null for ongoing work. Draft saves may omit affiliation.
- **Output:** `{ profile, subjects: [{ id, slug, name, description?, isSelectable, parent: { id, slug, name } }] }`
- **Errors:** `OPTIMISTIC_LOCK` (409) on version mismatch, `INVALID_TUTOR_PRICING` (400) on floor-price violation or changed legacy rates while V3 is active, `INVALID_TUTOR_SUBJECT_SELECTION` (400) when ids are not active specializations or exceed 7; tutor domain validation errors include field-specific data such as `missingFields`, `pricingError`, or `subjectIds` where available
- **Description:** Updates the tutor profile with optimistic locking and records a full profile audit snapshot pair when state changes. With the activation pointer unset, legacy `baseRatesIdr` writes remain available and V3 projection is `null`. With an active V3 revision, the editor shows read-only IDR fee tables derived from the active revision and rejects changed `baseRatesIdr` or legacy `prices`; unchanged legacy values in stale client payloads are ignored. Admin profile-edit approval also discards a queued legacy `baseRatesIdr` proposal. Existing booking snapshots remain authoritative. The tutor editor presents one combined Education, Achievements, and Experiences section plus one profile-image field; each experience stores a role, organization, start/end years, and a brief description. Affiliation stores a study program/university or professional role/organization and is required on review. Short bios are limited to 50 whitespace-delimited words (and 2,000 characters). Year values are plain integers, and an end year must be on or after its start year. Award titles normalize to the structured `awards` array. `achievementProofUrls` and `experienceProofUrls` accept bounded HTTP(S) URLs; `profileImageUrl` accepts bounded HTTP(S) URLs or a generated local `/uploads/...` storage path. The tutor-facing proof guidance recommends one Google Drive folder with the “Anyone with the link can view” setting. `profileImageUrl` is the canonical tutor profile image: draft/changes-requested updates write it to the account image, while published changes wait in `pendingProfileChanges` until admin review. `subjectIds` is the normalized specialization selection. Payout-account fields remain private. Trust-sensitive structured profile changes wait in `pendingProfileChanges`. The web editor exposes separate **Save draft**/**Save profile changes** and **Submit for review** actions: saving permits incomplete required top-level fields while still highlighting malformed values, while submission applies the complete required-field gate. Both client-side and API-side validation errors are shown beside the affected field and in the form summary.

- **Consistency:** Profile, canonical account-name, subject, photo, and audit writes share one database transaction. Reverting the final pending proposal clears both `pendingProfileChanges` and `profileEditStatus`.

`onlineMaxClassSize` and `offlineMaxClassSize` take effect immediately for new
booking requests; size 1 means private-only for that modality. Existing
bookings retain their stored target size and price snapshot.

Structured tutor experience fields use `experiences`. Years are plain integers; `endYear` may be `null` and cannot precede `startYear`.

### `tutor.submitForReview`

The web tutor profile editor groups Education, Achievements, and Experiences into one combined section with one public preview; review also requires affiliation and enforces the one-time Terms of Service acceptance described above.

- **Auth:** Tutor
- **Input:** `{ acceptTerms?: boolean }`
- **Output:** `{ profile }`
- **Errors:** `TUTOR_PROFILE_INCOMPLETE` (400) when required profile fields are missing; `INVALID_TUTOR_PRICING` (400) when a legacy base honorarium is invalid while V3 is inactive; `INVALID_TUTOR_SUBJECT_SELECTION` (400) when specialization ids are invalid; `TUTOR_TERMS_NOT_ACCEPTED` (400) when the profile has never accepted the current terms and `acceptTerms` is not `true`
- **Description:** Submits a draft profile for admin review. Affiliation, at least one achievement, and at least one experience are required. The service reads the active V3 pointer and profile inside the status-update transaction: when V3 is active, legacy `baseRatesIdr`/`prices` are neither required nor validated; when the pointer is null, the existing legacy pricing requirement remains. Incomplete and pricing errors identify fields for UI highlighting. First successful submission requires `acceptTerms: true`; later submissions may send `{}`.

### `tutor.listAvailability`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ items: AvailabilitySlot[] }`
- **Description:** Lists the tutor's active future availability slots

### `tutor.upsertAvailability`

- **Auth:** Tutor
- **Input:** `{ id?, startDate, endDate, modality, isRecurring?, recurrenceRule?, isActive? }`
- **Output:** `{ slot }`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Creates or updates a single availability window

### `tutor.createDateOverrides`

- **RPC path:** `/rpc/tutor/createDateOverrides`
- **Auth:** Tutor
- **Input:** `{ slots: [{ startDate, endDate, modality }] }` (1–56 future, non-overlapping one-off windows; `modality` is `online`, `offline`, or `both`)
- **Output:** `AvailabilitySlot[]`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409) when the submitted batch overlaps itself or an existing one-off window
- **Description:** Atomically creates multiple date-specific availability windows, including same-day windows whose start time is still in the future. Conflicting recurring occurrences are soft-deactivated; any one-off conflict rolls back the complete batch.

### `tutor.createWeeklyAvailability`

- **Auth:** Tutor
- **Input:** `{ startDate, endDate, repeatUntil, modality }`
- **Output:** `{ slots: AvailabilitySlot[] }`
- **Errors:** `WEEKLY_AVAILABILITY_RANGE` (400) if > 53 occurrences, `AVAILABILITY_SLOT_OVERLAP` (409)
- **Description:** Materializes weekly windows from `startDate` through `repeatUntil`

### `tutor.replaceWeeklyAvailability`

- **RPC path:** `/rpc/tutor/replaceWeeklyAvailability`
- **Auth:** Tutor
- **Input:** `{ effectiveFrom, repeatUntil, ranges: [{ dayOfWeek, startTime, endTime, modality }] }` (`dayOfWeek` 0–6, times use 24-hour `HH:mm`, max 21 weekly ranges, range up to 52 weeks)
- **Output:** `AvailabilitySlot[]`
- **Errors:** `AVAILABILITY_SLOT_OVERLAP` (409) for overlapping weekly ranges
- **Description:** Atomically deactivates future recurring windows from `effectiveFrom` and regenerates them through the inclusive `repeatUntil` date from weekly hours. The tutor web form exposes these values as Start date and End date pickers that constrain each other and enforce the existing 52-week limit. One-off date overrides are preserved and take priority over conflicting generated occurrences.

### `tutor.deleteAvailability`

- **Auth:** Tutor
- **Input:** `{ id }`
- **Output:** None (void)
- **Description:** Deactivates (soft-deletes) an availability slot. The tutor calendar preview asks for confirmation before calling this unchanged procedure.

### `tutor.getMyPayouts`

- **Auth:** Tutor
- **Input:** `{ dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (internal split fields remain for compatibility; the tutor UI renders only `tutorPayoutIdr`)
- **Errors:** `INVALID_DATE_RANGE` (400)
- **Description:** Compatibility summary for the authenticated tutor's unpaid honorarium. Fee events are authoritative and excluded by active per-session allocations; only legacy booking/session snapshot sources use the cutoff from historical aggregate payouts. Weekly processing is an operational cadence, not a calendar reset. The detailed tax and transfer breakdown is returned by `tutor.getMyPayoutFinance`.

### `tutor.getMyPayoutFinance`

- **HTTP:** `POST /rpc/tutor/getMyPayoutFinance` with the standard `{"json": {}}` body.
- **Auth:** Tutor; the tutor ID is taken from the authenticated session, not client input.
- **Input:** None.
- **Output:** `{ pending, history }`. `pending` contains own unpaid session count, gross, tax status/rate/source/withholding, one transfer fee, estimated net, and account/tax profile completion flags. `history` contains only the requesting tutor's saved payout snapshots and covered allocations, including booking number, session type, and scheduled date for each allocation.
- **Description:** Returns own finance data for the dashboard and does not include NIK, NPWP, bank account details, or another tutor's finance. Tutor tax identity remains available only from the authenticated tutor's own profile; admin payout reports require admin authorization.

---

## Public Content (`publicContent.*`)

### `publicContent.tutors.list`

- **Auth:** Public; no session cookie is required
- **HTTP request:** `POST /rpc/publicContent/tutors/list` with the standard `{"json": {}}` request body
- **Input:** `{}` (strict empty object)
- **Output:** `Tutor[]`; each item has exactly `id`, `name`, `profileImageUrl`, `shortBio`, `affiliation`, `education`, `achievements`, `experiences`, `subjects`, and `modality`. `education` items contain `{ university, degree }`; achievements contain `{ competitionName, year, awards }`; experiences contain `{ role, organization, startYear, endYear, description }`; subjects contain `{ id, slug, name, nameId, parent: { id, slug, name, nameId, lightTextColor, lightBackgroundColor, darkTextColor, darkBackgroundColor } }`. Indonesian names and palette values are nullable where the catalog schema permits them; child specializations inherit the parent palette through `parent`.
- **Description:** Reads only profiles whose `onboardingStatus` is `published`, using positive selected-column allowlists and an explicit public DTO mapper. Assigned catalog children and parents must both be active; inactive catalog types are omitted, and activity flags are not returned. `id` is the app tutor-profile ID; `profileImageUrl` comes from the canonical account image; subject IDs/slugs come from the app competition catalog. `modality` describes online/offline teaching format and is not a physical location. No location, Sanity ID, `userId`, price/rate, payout, tax, terms, or review fields are returned. Empty data returns `{"json": [], "meta": [...]}`. Database and mapping failures stay errors and are not translated to an empty list.
- **Consumer:** The marketing site's Next server can call this route without forwarding an app user session. Browser CORS is not enabled by this API slice.

### `publicContent.faq.list`

- **Auth:** Public; no session cookie is required
- **HTTP request:** `POST /rpc/publicContent/faq/list` with `{"json":{"locale":"en","surface":"full"}}`
- **Input:** `{ locale?: "en" | "id", surface?: "full" | "landing" }`; both default to `en` and `full`
- **Output:** `Faq[]`, each item `{ id, question, answer, questionRich, answerRich, sortOrder }`; the legacy answer blocks remain `{ type: "paragraph", text }` or `{ type: "list", style: "ordered" | "unordered", items }`. Rich documents are `{ type: "doc", blocks }` with paragraphs of text runs (`bold?`, `italic?`, safe `href?`) or ordered/unordered lists of text-run arrays.
- **Description:** Returns active entries alphabetically by the question displayed for the requested locale (locale-aware comparison, ID tie-break). `sortOrder` remains in the backward-compatible DTO and is assigned the zero-based display position. The `landing` surface also requires `showOnLanding = true`. Indonesian question and answer fields independently fall back to English when missing; rich and plain projections use the same locale fallback. Rich fields are additive; older consumers can ignore them, and the marketing adapter accepts their absence from an older API and renders the legacy text instead. Links allow `http:`, `https:`, `mailto:`, same-origin paths, and anchors. Public output still omits inactive/landing flags, version, and all admin-only fields. Reads are request-time; API and database failures remain errors rather than empty results. The marketing site calls this procedure server-side with `cache: no-store`, requires the `json` field, accepts `meta` when absent or an array (the configured API may omit empty metadata), validates rich entries, and renders failures separately from a valid empty list.

### `adminFaq.list`

- **Auth:** Admin
- **HTTP request:** `POST /rpc/adminFaq/list` with `{"json":{}}`
- **Input:** `{}` (strict empty object)
- **Output:** All `AdminFaqDto` entries ordered alphabetically by the English question, then ID. Each item includes `id`, `questionEn`, `questionId`, legacy `answerEn`/`answerId` projections, `questionEnRich`, `questionIdRich`, `answerEnRich`, `answerIdRich`, `isActive`, `showOnLanding`, `version`, and ISO `modifiedAt`.

### `adminFaq.create`

- **Auth:** Admin
- **HTTP request:** `POST /rpc/adminFaq/create` with the standard `{"json": <input>}` envelope
- **Input:** `{ questionEnRich, questionIdRich?, answerEnRich, answerIdRich?, isActive?, showOnLanding? }`. English rich question and answer are required; Indonesian documents are optional or `null`. A document is `{ type: "doc", blocks }`; blocks are paragraphs of text runs (`bold?`, `italic?`, safe `href?`) or ordered/unordered lists of text-run arrays. Questions are limited to 500 plain-text characters; documents to 50 blocks. Links allow `http:`, `https:`, `mailto:`, same-origin paths, and anchors; unsafe protocols and raw HTML are rejected. Active defaults to true and landing visibility to false.
- **Output:** The created `AdminFaqDto`, initially at version 1 with `modifiedAt`. The service also derives the legacy plain-text question and answer fields used by the public DTO.
- **Errors:** `BAD_REQUEST` when selecting the new entry would exceed the six-active-FAQ landing limit.

### `adminFaq.update`

- **Auth:** Admin
- **HTTP request:** `POST /rpc/adminFaq/update` with the standard `{"json": <input>}` envelope
- **Input:** The create fields plus `{ id, expectedVersion }`
- **Output:** The updated `AdminFaqDto` with its version incremented
- **Errors:** Wire codes are `NOT_FOUND` (404) when the ID does not exist, `CONFLICT` (409) when `expectedVersion` is stale, and `BAD_REQUEST` when selecting the entry would exceed the six-active-FAQ landing limit. The underlying FAQ domain error names are not exposed as the oRPC error code.
- **Description:** Updates are compare-and-swap writes. Deactivation hides the entry publicly and clears landing selection while retaining it for admin editing; there is no destructive delete procedure. Create uses the same six-active-entry landing limit.

## Tutor Discovery (`tutors.*`)

### `tutors.listSubjects`

- **Auth:** Public
- **Input:** None
- **Output:** `{ items: [{ id, slug, name, description?, children: [{ id, slug, name, description? }] }] }`
- **Description:** Returns the seven active competition categories and their 34 selectable specializations used by tutor onboarding and student filters, including Law Debate under Debate. The UIs submit specialization/category IDs for persistence or filtering but display category and specialization names to users. The compatibility procedure and response keys retain `subject`/`subjects` naming.

### `tutors.listPublished`

- **Auth:** Student
- **Input:** `{ search?, expertise?, categoryId?, subjectId?, categoryIds?, subjectIds?, modality?, limit?, offset? }` (`limit` default 20, max 50)
- **Output:** `{ items: TutorProfile[] }`; each profile includes published `user.image`, nullable `affiliation`, `education`, `achievements`, `experiences`, normalized `subjects`, class-size limits, and computed modality prices.
- **Description:** `categoryId`/`subjectId` remain supported for single-value clients. `categoryIds` and `subjectIds` accept up to 50 unique values. Search matches normalized specialization names. Results expose nullable `affiliation` plus canonical `education`, `achievements`, and `experiences` arrays. Marks prices derive from active economy config; tutor IDR base honoraria stay private.

### `tutors.getProfile`

- **Auth:** Student
- **Input:** `{ tutorId }`
- **Output:** `{ profile }` with `onlineMaxClassSize`, `offlineMaxClassSize`, and computed capacity-limited `pricesByModality` Marks maps
- **Description:** Returns the published tutor profile and future availability slots for the booking form, including the published image plus canonical education, achievements, and experiences. Marks prices use the active economy config for new IDR profiles; older pricing maps remain readable.

---

## Invite (`invite.*`)

### `invite.verify`

- **Auth:** Public
- **Input:** `{ token }`
- **Output:** `{ invite }`
- **Description:** Returns invite details without claiming

### `invite.claim`

- **Auth:** Protected
- **Input:** `{ token }`
- **Output:** `{ profile }`
- **Errors:** `INVITE_NOT_FOUND` (404), `INVITE_EMAIL_MISMATCH` (400), `PROFILE_ALREADY_EXISTS` (409)
- **Description:** Claims the invite using the signed-in user's email and creates a tutor profile in `onboarding` status

---

## Achievement (`achievement.*`)

### `achievement.listApproved`

- **RPC path:** `/rpc/achievement/listApproved`
- **Auth:** Public
- **Input:** None
- **Output:** `AchievementPublic[]` — the HTTP response uses the standard oRPC wrapper `{ "json": <array>, "meta": [...] }`. Each record contains `id`, `eventName`, `category`, `award`, `level`, optional `issuer`, `awardingDate`, `location`, `description`, `subjects`, `documentationUrl`, `createdAt`, and `displayName`.
- **Description:** Returns approved and visible achievements for the public `cogito-acad` homepage preview and `/[locale]/achievements` archive. The projection intentionally excludes `userId` and private verification `evidenceUrl`; rejected, pending, and hidden achievements are never exposed. Results are ordered by awarding date, then creation date, and capped at 100 records.

### `achievement.list`

- **Auth:** Protected
- **Input:** `{ category?, status?, limit?, offset? }` (`category` is one of `competition`/`award`/`certificate`/`leadership`/`publication`/`other`; `status` is one of `draft`/`pending`/`pending_review`/`approved`/`rejected`/`archived`; `limit` defaults to 50 and is capped at 100; `offset` defaults to 0)
- **Output:** `Achievement[]` for the requested page
- **Description:** Returns the authenticated user's achievements from a bounded database query. A `status` of `pending` includes both `pending` and legacy `pending_review` rows. The student `/achievements` page uses this contract for server-side category/status filtering and offset pagination, while aggregate cards use `achievement.stats`.

### `achievement.stats`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ total, approved, pending, rejected, archived }`
- **Description:** Returns aggregate status counts for the authenticated user's achievements. `pending` combines `pending` and `pending_review`.

### `achievement.create`

The create/edit/correction form is presented as a bottom drawer on mobile and a right-side drawer from the `sm` breakpoint. This is client-side presentation only and does not change RPC inputs, outputs, or persistence.

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17; FR-18 is student-facing)
- **Input:** `{ eventName, category, award, level, awardingDate?, location?, description?, subjects?, evidenceUrl? }`
- **Output:** `{ achievement }`
- **Description:** Submits a new achievement in `pending` status. Student submissions may include only the private verification `evidenceUrl`, which must be an HTTP(S) URL of at most 2048 characters. The public `documentationUrl` is intentionally admin-managed.

### `achievement.update`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17)
- **Input:** `{ id, version, data: { eventName?, category?, award?, level?, awardingDate?, location?, description?, subjects?, evidenceUrl? } }`
- **Output:** `{ achievement }`
- **Description:** Updates a pending achievement; optimistic locking via `version`. The student route cannot set or overwrite the public documentation image.

### `achievement.delete`

- **Auth:** Student (`studentProcedure` — tutors/admins get FORBIDDEN, F17)
- **Input:** `{ id, version }`
- **Output:** `{ deleted }`
- **Description:** Deletes a pending achievement; optimistic locking via `version`

### `achievement.adminList`

- **Auth:** Admin
- **Input:** `{ status?, deleted?, limit?, offset? }` (`limit` default 50; `deleted` defaults to `false`)
- **Output:** `Achievement[]` for the requested page
- **Description:** Returns a server-paginated moderation page. `status: "pending"` includes both `pending` and `pending_review` rows. Soft-deleted rows are excluded unless `deleted: true`. The admin `/admin-achievements` page uses a `limit + 1` sentinel to detect the next page; aggregate status cards use `achievement.adminStats`.

### `achievement.adminStats`

- **Auth:** Admin
- **Input:** None
- **Output:** `{ total, approved, pending, rejected, archived }`
- **Description:** Returns aggregate status counts across active achievement submissions. Soft-deleted rows are excluded. `pending` combines `pending` and `pending_review`.

### `achievement.adminUpdate`

- **RPC path:** `/rpc/admin/achievements/update`
- **Auth:** Admin
- **Input:** `{ id, version, data: { eventName?, category?, award?, level?, issuer?, visibility?, awardingDate?, location?, description?, subjects?, evidenceUrl?, documentationUrl? } }`; nullable optional fields can be cleared
- **Output:** `{ achievement }`
- **Description:** Corrects a pending or legacy `pending_review` achievement before moderation. Admins can correct the submission fields and set or clear the public documentation image. The update uses optimistic compare-and-swap via `version`, records an `achievement_admin_updated` audit event with before/after content, and leaves the status unchanged so approval/rejection remains a separate action. A stale version returns `OPTIMISTIC_LOCK` (409); non-pending records return `ACHIEVEMENT_NOT_EDITABLE`.

### `achievement.adminDelete`

- **RPC path:** `/rpc/admin/achievements/delete`
- **Auth:** Admin
- **Input:** `{ achievementId }`
- **Output:** `Achievement`
- **Description:** Soft-deletes an achievement and records `achievement_deleted`. The row mutation and audit record commit atomically.

### `achievement.adminRestore`

- **RPC path:** `/rpc/admin/achievements/restore`
- **Auth:** Admin
- **Input:** `{ achievementId }`
- **Output:** `Achievement`
- **Description:** Restores a soft-deleted achievement and records `achievement_restored`. The row mutation and audit record commit atomically.

### `achievement.adminReview`

- **Auth:** Admin
- **Input:** `{ achievementId, status, adminNote? }` (`status` one of `approved`/`rejected`/`archived`)
- **Output:** `{ achievement }`
- **Description:** Moderation action per the transition table (F12): `pending`/`pending_review` → `approved`/`rejected`/`archived`; `approved`/`rejected` → `archived` (hide from public surfacing); `archived` → `approved`/`rejected` (restore). Other transitions throw `ACHIEVEMENT_NOT_EDITABLE`. The row is updated with optimistic compare-and-swap semantics; a concurrent moderation decision returns `OPTIMISTIC_LOCK` (409) and emits no duplicate notification/audit. Owner is notified and an `achievement_{status}` audit record is written after a successful update.

---

## Wallet (`wallet.*`)

### `wallet.get`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ id, totalBalance, heldBalance, availableBalance }`
- **Description:** Returns the authenticated user's wallet (lazily created)

### `wallet.listLedger`

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, bookingId?, eventKey? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }`

### `wallet.listPackages`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ packages: MarkPackage[] }`
- **Description:** Returns active purchasable Mark packages. The default catalog is installed automatically by versioned database migration `0041_seed_mark_packages.sql`; values are Starter Pack 50 Marks / Rp312,500; Learner Pack 120 Marks / Rp690,000; Explorer Pack 200 Marks / Rp1,070,000; Pioneer Pack 400 Marks / Rp2,000,000. Admins can manage later catalog changes through `adminMarkPackage.*`.

### `wallet.knowledgeBankEligible`

- **Auth:** Protected (student, tutor, or admin)
- **Input:** None
- **Output:** `{ eligible, balance, threshold }`
- **Description:** Checks Knowledge Bank access without changing the wallet. Students must meet the 35-Mark threshold, and eligibility plus `balance` use the **total balance** (held Marks count, per PRD DL-16 / U13). Tutors and admins are eligible regardless of wallet balance; `balance` is still returned when a wallet exists and is `0` when no wallet exists. No Marks are deducted.

> Note: `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer methods only — they are not exposed over RPC; other modules call them via consumer-driven ports.

---

## Payment (`payment.*`)

### `payment.getConfig`

- **HTTP:** `POST /rpc/payment/getConfig`
- **Auth:** Protected
- **Input:** None
- **Output:** `{ testMode: boolean }`
- **Description:** Returns the public payment-environment flag used by the
  Balance page. `testMode` is true when the active provider is configured with
  `MIDTRANS_MODE=test`; no provider credentials or allowlist values are exposed.

### `payment.createPurchase`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role **and** `emailVerified: true`; unverified students get `FORBIDDEN` "Email verification required")
- **Input:** `{ packageCode }`
- **Output:** `{ paymentId, providerReference, checkoutUrl, canSimulate }`
- **Errors:** `PACKAGE_NOT_FOUND` (404), `PAYMENT_TEST_MODE_RESTRICTED` (403), `PAYMENT_PROVIDER_ERROR` (503)
- **Description:** Creates a purchase intent with the payment provider. Before reusing a current PENDING intent, the service checks its authoritative provider status when status lookup is available. A remotely expired/failed attempt is reconciled and replaced with a new payment record, while a genuinely pending attempt is reused so retries do not mint duplicate checkouts. After any terminal outcome (`PAID`, `SETTLED`, `FAILED`, `EXPIRED`, or `REFUNDED`), the endpoint creates a new payment record and provider reference, retaining the prior attempt as history. A provider-confirmed paid status credits the wallet through the idempotent confirmation path. If provider lookup is unavailable, the existing PENDING intent is reused rather than risking a duplicate charge.

### Midtrans (Snap) environment selection

- `PAYMENT_PROVIDER=midtrans` selects the Midtrans Snap provider. `MIDTRANS_MODE` is required and must be `test` (Sandbox) or `live` (Production); the Server Key, created in the matching Midtrans dashboard mode, selects the actual environment. `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, and `MIDTRANS_MERCHANT_ID` are required (fail-loud env guard).
- In production/staging, `MIDTRANS_MODE=test` also requires `PAYMENT_TEST_ALLOWED_EMAILS`; only approved verified student emails can call `payment.createPurchase`.
- `checkoutUrl` carries the Snap `redirect_url` (hosted payment page). After the drawer confirmation, the Balance page navigates directly to it.
- `canSimulate` is **always false** in Midtrans mode: the Midtrans Sandbox has no simulation endpoint. Sandbox test payments use the Snap test cards (`4811 1111 1111 1114`, CVV `123`, OTP `112233`). `payment.simulatePurchase` returns `PAYMENT_SIMULATION_UNAVAILABLE` (403) in Midtrans mode.
- `order_id` is the payment UUID (unique per repurchase attempt); webhooks and status lookups resolve it back to the stored provider reference.
- Rejections surface as `PAYMENT_TEST_MODE_RESTRICTED`, visible on the Important Logs board payment gate panel.

### `payment.simulatePurchase`

- Input: `{ paymentId: string (UUID) }`
- Output: `{ status: "PENDING", message: string }`
- Auth: verified student, approved Test Mode email, and ownership of a pending payment.
- Midtrans mode always returns `PAYMENT_SIMULATION_UNAVAILABLE` because Sandbox has no simulation endpoint. The endpoint remains for compatibility with clients that already know the procedure.

### `payment.getPurchase`

- **Auth:** Protected
- **Input:** `{ paymentId }`
- **Output:** `{ id, status, provider, providerReference, amountIdr, marks, receiptUrl, failureReason, createdAt }`
- **Errors:** `PAYMENT_NOT_FOUND` (404)
- **Description:** Returns the payment record if owned by the requesting user

### `POST /webhooks/payments/:provider` (external)

- **Auth:** Public (non-oRPC route)
- **Input:** Raw body; Midtrans verifies body `signature_key`, stub verifies `x-webhook-signature`; timestamp validation is skipped for Midtrans because its body signature is the authenticity check.
- **Output:** `{ ok: true }`
- **Errors:** 401 signature failure, 408 stale timestamp (> 5 min when applicable), 403 IP not allowlisted, 500 processing failure
- **Description:** Provider webhook; verifies signature, validates any applicable timestamp, then atomically claims the lifecycle idempotency key (released on transient processing failure), calls `payment.confirmFromWebhook`, and updates payment status (`PENDING → PAID/SETTLED/FAILED/EXPIRED`; `PAID/SETTLED → REFUNDED`). Lifecycle keys include provider, verified event/reference id, and normalized status, so different lifecycle states process while retries of one state dedupe. Every repeat purchase uses a separate payment row and provider reference, so late events from an earlier attempt cannot change the newer attempt's state or suppress its wallet credit. A REFUNDED webhook reads the wallet through the transaction (`wallet.getByUserId(tx, ...)`, N4) and reverses credited Marks from the **total balance** (`held + available`): held Marks are released (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`) when total ≥ marks; if Marks were already spent (`totalBalance < marks`, H4), the payment is still marked REFUNDED and a `refund_webhook_reconciliation` audit + `refund_record` row are written for admin (no reversal, no throw, no 500/retry loop — P2.7/H4, M1/N4 wave-6b)

### Midtrans (Snap) webhook (`POST /webhooks/payments/midtrans`)

- **Signature:** the `signature_key` is **inside the JSON body** — `SHA512(order_id + status_code + gross_amount + signatureKey)` where `signatureKey` is `MIDTRANS_WEBHOOK_SIGNATURE_KEY` or, when unset, the Server Key. There is no signature header; the route passes an empty header value and the provider verifies the body. As defense-in-depth, a signed notification whose `merchant_id` does not match `MIDTRANS_MERCHANT_ID` is rejected (401).
- **Payload fields:** `order_id` (our payment UUID), `transaction_id`, `transaction_status`, `status_code`, `gross_amount`, `fraud_status`, `status_message`, `payment_type`, `merchant_id`.
- **Status mapping:** `capture`→PAID (with `fraud_status=accept`; `challenge`→PENDING, `deny`→FAILED), `settlement`→SETTLED, `pending`/`authorize`→PENDING, `deny`/`cancel`/`failure`→FAILED, `expire`→EXPIRED, `refund`/`partial_refund`→REFUNDED.
- **Reference resolution:** `order_id` is the payment UUID (Snap `order_id` max 50 chars, `[A-Za-z0-9._~-]` — the provider reference contains colons and can exceed 50 chars). The provider resolves the UUID back to the stored `providerReference` via a DB lookup; when unresolvable it falls back to the `order_id` and the service's DB reference fallback.
- **Idempotency:** the same lifecycle key derivation applies — `midtrans:{transaction_id ?? order_id}:{status}` — so a `settlement` retry dedupes while a later `refund` for the same payment still processes.

### Provider refunds

- `adminRefund` never calls the payment provider — admin refunds are in-app Marks credits only (PRD §677: purchased Marks are never convertible to rupiah). `refund_record.amount_idr` is `0` and `provider_event_id` is `NULL` for admin refunds. The provider `refund()` port remains available for a future payment-error-only cash-refund flow, but `adminRefund` must never invoke it.

---

## Booking (`booking.*`)

### `booking.createSolo`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, scheduledStartAt, timezone?, learningGoal }` (`subjectId` selects one active specialization offered by the tutor and is snapshotted as the session topic; legacy callers may omit it and the sole tutor specialization is selected automatically; `learningGoal` carries Session Notes and accepts up to 2,000 characters including reference links; duration is server-fixed to 90 minutes). The web form may group `subjectId` and `learningGoal` into one Session details fieldset and present `modality` with Selia Tabs; this presentation does not change the RPC input.
- **Output:** `{ booking }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400), `BOOKING_CONFLICT` (409), `INSUFFICIENT_MARKS` (400)
- **Description:** Creates a solo booking and holds Marks; idempotency via `idempotency-key` header
- **Frontend note:** The student form places modality and the summary in a desktop right rail. Availability remains a card grid; each selected slot reveals its own adjacent start-time editor when width permits and stacks it below on narrow screens. Desktop and mobile summaries state participant scope separately from single/series cadence, list concrete series dates, and distinguish the student's price from the balance reserved by the applicable hold rule. Monetary values use `CogitoMarks`, and displayed booking dates use the shared compact formatter. Mobile uses a compact sticky bottom preview plus review drawer. The drawer submission targets the same form and does not change this RPC contract.

### `booking.get`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ booking, participants, history, meetingStatus, meetingUrl }` — access-checked for the proposer, tutor, participants, or admin; participant/tutor/proposer user objects are limited to `id`, `name`, `image`, and `role` (never account email), and history entries include `fromState`, `toState`, `actorType`, `reason`, and `createdAt`
- **Errors:** `BOOKING_NOT_FOUND` (404)
- **Description:** `meetingStatus` is `ready` only when a URL exists, `pending` while the booking is awaiting the tutor/participants or a tutor/admin fallback link, and `failed` when automatic Google Meet creation needs another retry. If tutor acceptance encounters a provider failure, the booking remains `confirmed` until retry or manual-link recovery; clients must not treat that state as `scheduled`.
- **Frontend note:** Booking activity presents the destination state as the primary badge and uses transition-specific icons for participant, scheduling, room, and terminal events. The detail page composes schedule, format/access, and participant profile/name/status information in the overview, places role-appropriate primary actions (including per-session reschedule for series via `sessionId` and completion when eligible) directly below the status badge, shows `Total honorarium (N sessions)` for tutor-viewed series bookings, keeps contextual actions above Marks or in the main flow, and shows a live response-window notice for deadline-bound states. The API contract is unchanged.

**UI behavior note:** The booking detail surface uses compact accessible Selia `IconInfoSquareRounded` popover triggers for online-link explanations, retry/manual setup status, available meeting-room access, missing offline-room details, and tutor completion timing. Available links no longer render a `Ready` badge or standalone CTA; the popover contains the meeting-room action. The trigger supports hover, keyboard focus, click, and touch; the overview merges the date and hours into one `Date & time` field, places Format & access beside it in a responsive two-column grid that stacks on narrow screens, and keeps the desktop overview/activity flow independent from the sticky Actions/Marks rail so rail height does not add a blank row before Activity. Admin details embed room management and per-participant wallet/ledger data in the overview, use a single-column participant list, place review context in the right rail, and render state history with the shared activity timeline. Narrow layouts keep actions/Marks before Activity. This does not change the `booking.get` response contract.

### `booking.listMine`

**Frontend title parity:** Booking list rows and the booking-detail header use
the same presentation formatter as Calendar/Meet:
`Cogito - {Competition} | {Tutor} x {Student}`, with `& Friends` for
group/group-series bookings. This does not add a response field or change the
RPC contract.

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, states?, view? }`, where `view` is `action | upcoming | recurring | history | all`
- **Output:** `{ items: Booking[], nextCursor, counts: { action, upcoming, recurring, history, completed, problem, all } }`
- **Description:** Shared role-aware booking list. Students see bookings where they are proposer or participant, tutors see bookings assigned to them, and admins see all bookings. `states` can narrow results for server consumers; `view` applies the booking-list tab semantics server-side before cursor pagination. The `action` view includes pending booking decisions for all roles and, for tutors only, `scheduled` single/group bookings whose `scheduledEndAt` has passed plus series bookings with at least one ended scheduled child session. Those completion tasks are excluded from the tutor's `upcoming` and `history` facets until completed. `completed` counts bookings in `completed`; `problem` counts `cancelled`, `late_cancelled`, `no_show`, and `expired`. Counts are exact role-scoped facets across all accessible bookings, not only the current page. The web requests 20 items at a time and follows `nextCursor` for **Load more bookings**. Related user projections contain display identity only (`id`, `name`, `image`, `role`); internal meeting attendee email arrays are never part of this response. The web row presents Marks with the Cogito mark icon and keeps status explanations in the status-badge tooltip. Dashboards reuse the same read model for their next-lesson card; no dashboard-specific endpoint is required.

### `booking.cancel`

- **Auth:** Student
- **Input:** `{ bookingId, cancellationReason }` (`cancellationReason` is trimmed, required, and limited to 500 characters)
- **Output:** `{ booking }`
- **Description:** Cancels a booking before its scheduled start. A cancellation within H-2 becomes `late_cancelled` and forfeits held Marks; at or after `scheduledStartAt`, the procedure rejects with `BOOKING_CANCELLATION_DEADLINE_PASSED` so the live booking remains available for tutor completion. Session-delivery or attendance problems after start go through support/admin review.

### `booking.acceptReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Records one acceptance on the active, unexpired proposal. Partial acceptance does not change the schedule; before unanimous tutor + active-student acceptance applies the proposed 90-minute time, the server serializes the booking/tutor decision and rechecks tutor overlap plus series-session ownership/state/sibling overlap. A stale, expired, or newly conflicting target is rejected without changing the schedule. Successful acceptance restores the booking state that was active before the proposal and best-effort updates its Google Calendar event in place; online updates notify all attendees and preserve conference data. For an offline booking-level proposal, the active room assignment is moved with the booking when available; a room conflict or missing assignment returns the booking to `awaiting_admin_room_approval`.

### `booking.getRescheduleAvailability`

- **RPC path:** `/rpc/booking/getRescheduleAvailability`
- **Auth:** Protected; booking tutor, proposer, or participant
- **Input:** `{ bookingId }`
- **Output:** `AvailabilitySlot[]`
- **Description:** Returns active tutor availability for the booking-scoped reschedule picker. Access is checked against the booking rather than tutor discovery visibility. Frontend scheduling surfaces may group these unchanged window records by local date and derive valid 15-minute session starts that leave room for the fixed 90-minute duration; presentation grouping such as Morning/Afternoon/Evening does not change the selected source `availabilitySlotId` used by proposal/booking inputs.
- **Rate limit:** This protected read is intentionally excluded from the booking mutation limiter; repeated picker refreshes do not consume the 30/minute booking-action budget.
- **Reschedule invariant:** `/rpc/booking/proposeReschedule` and `/rpc/tutorActions/proposeReschedule` reject a proposed start in the same minute as the active booking/target-session start or the pending proposal for that same target with `BOOKING_NOT_EDITABLE`. Proposal replacement is serialized, and only one pending proposal may exist per booking.

### `booking.rejectReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Rejects the active, unexpired proposal under the same booking-level decision lock, preserves the original schedule, and restores the booking state that was active before the proposal. Expired/stale decisions are rejected and left for the expiry worker. Offline booking-level proposals also restore the confirmed room assignment to the original window; a conflict or missing assignment falls back to `awaiting_admin_room_approval`.

### `booking.proposeReschedule`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason }` (`reason` is trimmed, required, and limited to 2,000 characters)
- **Output:** `{ booking }`
- **Description:** Proposes a new fixed 90-minute time for one booking session; the booking proposer may use the route in the eligible pre-terminal states, including `confirmed` and `scheduled`. Student proposals must remain outside the current and proposed session's H-2 window; otherwise the API rejects the mutation as not editable. Proposals expire after 24 hours and require tutor plus all active-student approval. Force-majeure exceptions are handled through support/admin operations and an auditable admin override, not by bypassing this route. The booking-detail frontend collects this unchanged input in a bottom drawer on mobile and a right-side drawer on desktop.

### `booking.cancelSession`

- **Auth:** Student (proposer)
- **Input:** `{ sessionId }`
- **Output:** `{ booking }`
- **Errors:** `BOOKING_CANCELLATION_DEADLINE_PASSED` (400) after start; `BOOKING_STATE_TRANSITION` (409) if a concurrent action already moved the child; `BOOKING_PARTICIPANT_NOT_FOUND` (404) if the proposer hold row is missing
- **Description:** Student cancels an individual series session before that session starts; pre-H-2 releases the session hold and a pre-start post-H-2 cancellation forfeits it (per-session penalty, #46). The booking, child session, and proposer hold are re-read under locks; the child moves to `cancelled` only from `scheduled`. If delivery completion wins a race, cancellation is rejected without a second wallet/hold change or overwriting the report. Cancellation shares the booking reschedule lock. At/after the session start it rejects with `BOOKING_CANCELLATION_DEADLINE_PASSED`. Group-series sessions cannot be cancelled (no opt-out).

### `booking.addSessionNote`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId, content }` (`content` max 10,000 chars, sanitized)
- **Output:** `{ note }`
- **Description:** Adds a note to a completed session for protected API clients. The completed-booking web UI no longer exposes this mutation; the API sanitizer remains authoritative before persistence.

### `booking.getSessionNotes`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId }`
- **Output:** `{ items: SessionNote[] }`
- **Description:** Returns all legacy notes for the completed booking so protected API clients can read the shared session record. The procedure remains available for API compatibility; the web client no longer queries or renders a Session notes card.

### `booking.createGroup`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, targetGroupSize, inviteeUserIds, scheduledStartAt, timezone?, learningGoal, requestedRoomId? }` (`subjectId` selects an active tutor specialization; `learningGoal` carries Session Notes including reference links; `targetGroupSize` 2–6, `inviteeUserIds` 1–5; duration is fixed to 90 minutes)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_TUTOR_CAPACITY` (400) when `targetGroupSize` exceeds the tutor's maximum for the requested modality
- **Description:** Creates a group booking, holds the target headcount total from the proposer, invites participants, and releases the excess hold as invitees confirm; idempotency via `idempotency-key` header

### `booking.createSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure`; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, sessions: [{ availabilitySlotId, scheduledStartAt }], timezone?, learningGoal }` (`subjectId` selects an active tutor specialization; `learningGoal` carries Session Notes including reference links; 2–4 fixed 90-minute sessions). Multiple non-overlapping sessions may reference the same availability slot when each concrete start fits that window; `assertNoIntraSeriesOverlap` rejects overlapping 90-minute sessions.
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400) if sessions < 2 or > 4
- **Description:** Creates a multi-session solo series booking

### `booking.createGroupSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure` — unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, sessions: [...], targetGroupSize, inviteeUserIds, timezone?, learningGoal }` (`subjectId` selects an active tutor specialization; `learningGoal` carries Session Notes/reference links; `targetGroupSize` 2–6, `inviteeUserIds` 1–5, sessions 2–4)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400), `BOOKING_TUTOR_CAPACITY` (400) when the target exceeds the tutor's modality limit, `USER_NOT_FOUND` (400) for unknown invitees
- **Description:** Creates a group series with upfront per-participant holds for all sessions (FR-20, #46). When V3 is active, it requires a supported selected topic, prices at target headcount and pins the revision on the booking and sessions. A partial group is repriced from that pinned revision at confirmed headcount; each participant holds the per-session Marks times remaining scheduled sessions. With activation null, existing legacy pricing is preserved. Invitees accept/decline the full-series package via `booking.confirmInvite`/`booking.declineInvite`.

### `booking.confirmInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId }`
- **Output:** `{ confirmedHeadcount, targetGroupSize }`
- **Description:** Invitee confirms participation and holds Marks

### `booking.declineInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ declined: true }`
- **Description:** Locks the parent booking before changing the invitation and resolving remaining responses, preventing concurrent final invite decisions from racing. Declines one pending group or group-series invitation. When no pending invitees remain, the parent resolves immediately: fewer than two confirmed participants expires the booking and releases holds; a viable partial group enters `awaiting_reconfirmation` with a fresh response window; a full group enters `awaiting_tutor_review`. For active V3 group-series, a partial group is recalculated at its confirmed headcount from the pinned revision, and participant holds plus booking/scheduled-session snapshots are adjusted before reconfirmation.

### `booking.withdrawInvite`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, inviteeUserId, reason? }`
- **Output:** `{ withdrawn: true, inviteeUserId }`
- **Description:** Locks the parent booking before changing the invitation and resolving remaining responses, preventing concurrent final invite decisions from racing. Withdraws one pending group or group-series invitation before confirmation. The target participant is marked `withdrawn_pre_h2`, confirmed headcount is unchanged, and the invitee receives a booking notification. When no pending invitees remain, the same parent resolution as `booking.declineInvite` runs; undersized bookings release remaining holds and expire, while viable partial groups enter reconfirmation. Active V3 group-series repricing uses confirmed headcount and the booking's pinned revision.

### `booking.reconfirm`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, accept }`
- **Output:** `{ reconfirmed: boolean }`
- **Description:** Participant accepts or rejects the repriced offer. For active V3 group-series, a headcount change during reconfirmation triggers a fresh pinned-revision calculation and reissues reconfirmation; the booking reaches tutor review only when every confirmed participant accepts the current snapshot.

### `booking.withdraw`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ withdrawn: true, late: boolean }`
- **Description:** Participant withdraws before the scheduled start; pre-H-2 releases held Marks and a pre-start post-H-2 withdrawal forfeits them. At/after `scheduledStartAt`, the procedure rejects with `BOOKING_CANCELLATION_DEADLINE_PASSED`. Group-series bookings (`type: "series"` with `targetGroupSize > 1`) are rejected with `CONFLICT` (`BOOKING_SERIES_NO_OPT_OUT`) — no opt-out from the series (U4)

### `booking.listSessions`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ sessions: BookingSession[] }`
- **Errors:** `BOOKING_NOT_EDITABLE` if not a series

---

## Tutor Actions (`tutorActions.*`)

### `tutorActions.listBookings`

- **RPC path:** `/rpc/tutorActions/listBookings`
- **Auth:** Tutor
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Returns bookings assigned to the signed-in tutor

### `tutorActions.proposeReschedule`

- **RPC path:** `/rpc/tutorActions/proposeReschedule`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason }` (`reason` is trimmed, required, and limited to 2,000 characters)
- **Output:** `{ booking }`
- **Description:** Tutor proposes a new fixed 90-minute time for one session; tutor proposals may be outside the original availability window and require every active student's acceptance

### `tutorActions.acceptBooking`

- **RPC path:** `/rpc/tutorActions/acceptBooking`
- **Auth:** Tutor
- **Input:** `{ bookingId }`
- **Output:** `{ booking, isOffline }`
- **Description:** Tutor accepts a booking; online attempts to create the meeting immediately and moves to `scheduled` on success. Calendar titles use `Cogito - {Competition} | {Tutor} x {Student}` or append `& Friends` for groups. Descriptions include tutor/students, the snapshotted Session Topic, Session Notes/reference links, and `/bookings/{bookingId}`. Provider failure leaves the booking `confirmed` for retry/manual fallback; offline goes `awaiting_admin_room_approval`.
- **Frontend note:** The tutor booking-detail flow presents a responsive confirmation summary before calling this unchanged procedure; the dialog does not change the input, output, or transition rules.

### `tutorActions.setMeetingLink`

- **RPC path:** `/rpc/tutorActions/setMeetingLink`
- **Auth:** Tutor (assigned tutor only)
- **Input:** `{ bookingId, url }` (`url` must be an `http://` or `https://` URL, max 2048 chars)
- **Output:** `{ bookingId, meetingUrl, status }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_OWNED` (403), `BOOKING_NOT_EDITABLE` (400) for offline, terminal, or not-yet-confirmed/scheduled bookings
- **Description:** Records a manual meeting URL when automatic Google Meet setup is unavailable. Only the assigned tutor can use it, and only for an online booking in `CONFIRMED` or `SCHEDULED`; it updates the active meeting-attempt row, notifies confirmed participants, and writes a `tutor_set_meeting_link` audit record.

### `tutorActions.declineBooking`

- **RPC path:** `/rpc/tutorActions/declineBooking`
- **Auth:** Tutor
- **Input:** `{ bookingId, reason }` (`reason` is trimmed, required, and limited to 500 characters)
- **Output:** `{ booking }`
- **Description:** Tutor declines a booking and releases held Marks

### `tutorActions.completeSession`

- **RPC path:** `/rpc/tutorActions/completeSession`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId?, feedback: { discussion: string[1..30], strengths: string[1..30], improvements: string[1..30] } }` (`sessionId` required for series child sessions; each bullet 1–1000 chars)
- **Output:** `{ booking }`
- **Description:** Marks a scheduled session completed and deducts held Marks. Requires session discussion, strengths observed, and areas for improvement; saves one `session_completion_feedback` row atomically (per booking for solo/group, per session for series). In the same transaction it appends one `tutor_session_fee` event for the completed delivery (booking identity for solo/group; child-session identity for series), including the pinned price snapshot and gross IDR honorarium. For a series session with a prior participant no-show ledger entry, completion skips that already-charged allocation and preserves future holds; a no-show without this completion report earns no tutor fee. Malformed V3 honoraria fail before settlement writes. Concurrent completion is serialized so only one report, deduction, and fee is recorded. A series parent completes after every child is completed or cancelled, then releases residual participant holds. This is an earned-fee fact, not a payout; the RPC output is unchanged. Missing/empty feedback returns `BOOKING_COMPLETION_FEEDBACK_REQUIRED` (400).
- **Frontend note:** Cancel uses Selia confirmation dialog; complete uses `CompleteSessionDialog` for three textarea-backed tutor feedback sections (each line is a bullet and Enter adds another). Booking detail shows read-only Student notes with Session feedback directly beneath it in the same Session overview block after completion. Mutation feedback is emitted through the global toast layer and does not change this RPC contract.

### `booking.listCompletionFeedback`

- **RPC path:** `/rpc/booking/listCompletionFeedback`
- **Auth:** Protected (student/tutor with booking access, admin bypass)
- **Input:** `{ bookingId }`
- **Output:** `SessionCompletionFeedback[]` (`{ id, bookingId, sessionId|null, authorId, discussion[], strengths[], improvements[], createdAt }`)
- **Description:** Lists required completion feedback for payout review. Student and admin read after completion; series shows per-session rows.

### `tutorActions.markAttendance`

- **RPC path:** `/rpc/tutorActions/markAttendance`
- **Auth:** Tutor
- **Input:** `{ bookingId, attendance }` (`attendance` one of `present`/`late`)
- **Output:** `{ bookingId, attendanceState }`
- **Description:** Marks tutor attendance; only allowed within ±15 minutes of the scheduled start (`BookingNotEditableError` otherwise, so tutors can't pre-mark to dodge lateness). There is no auto-cancel: an unmarked session is instead surfaced to the admin queue via `adminBooking.listBookings({ category: "tutor_lateness_pending" })`.

### `tutorActions.markParticipantNoShow`

- **RPC path:** `/rpc/tutorActions/markParticipantNoShow`
- **Session ownership invariant:** For a series booking, `sessionId` must be a child of the supplied `bookingId`; a session from another series is rejected before any wallet deduction or attendance mutation.
- **Auth:** Tutor
- **Input:** `{ bookingId, participantUserId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ bookingId, participantUserId, sessionId, forfeitedMarks }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) before start+15 min, if a report already exists, or for a repeated series no-show; `BOOKING_STATE_TRANSITION` (409) if not `scheduled`
- **Description:** Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); their session hold is forfeited. A solo booking transitions to `no_show`; a group booking stays live and only the target's hold is forfeited (C1); a series session keeps its state so other participants are unaffected. A series no-show is keyed to that participant and child session, and a repeated mark is rejected. Its ledger entry prevents a later delivery report from charging that allocation twice; the entry alone does not earn a tutor fee.

---

## Room (`room.*`)

### `room.list`

- **Auth:** Protected
- **Input:** Optional `{ limit, offset }` (`limit` 1–100; `offset` ≥ 0)
- **Output:** `Room[]` — active rooms
- **Description:** Lists active rooms for offline scheduling. The admin room catalog supplies `limit` and `offset` for server-side pagination; callers that omit the input retain the unbounded selector-compatible list.

### `room.listPendingApprovals`

- **Auth:** Admin
- **Input:** Optional `{ limit, offset }` (`limit` 1–100; `offset` ≥ 0; omitted input defaults to the legacy 50-row query)
- **Output:** `PendingRoomApproval[]`
- **Description:** Lists offline bookings in `awaiting_admin_room_approval`, ordered by session start, using a bounded database query when pagination input is supplied. Each item includes booking timing/participant summary and the optional requested room; bookings whose requested room was unavailable are included with `requestedRoomId: null`.

### `room.create`

- **Auth:** Admin
- **Input:** `{ name, location, capacity }`
- **Output:** `{ room }`
- **Frontend:** Admin → Operations → Room approvals → Active rooms → Add room. The form trims name/location, validates a positive whole-number capacity, and refreshes the active-room list after creation.

### `room.update`

- **Auth:** Admin
- **Input:** `{ id, name, location, capacity }`
- **Output:** `{ room }`
- **Description:** Updates an active or inactive room's name, location, and learner capacity. The admin Room approvals catalog uses this to edit room details and refreshes active-room selectors after success.

### `room.deactivate`

- **Auth:** Admin
- **Input:** `{ id }`
- **Output:** `{ room }`
- **Description:** Soft-deactivates a room so it is removed from new offline-booking selectors while historical room assignments remain intact. Repeating the request for an already inactive room is idempotent.

### `room.assign`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Confirms a room for an offline booking and transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`; it may also assign a new room to an already `SCHEDULED` offline booking after its prior room was removed. After commit, it best-effort creates or refreshes a normal Google Calendar event with the room/location, a description headed by `Site: {room.location}` and `Room: {room.name}`, and no Meet conference; provider failure never rolls back scheduling, and repeated sync reuses the live event. A scheduled booking with an active room must use relocation instead. Notifies tutor + confirmed students (G14, #46). The admin UI invokes this from the Room approvals queue or the booking detail room controls; `bookingId` and `roomId` remain internal identifiers in the RPC input.

### `room.checkAvailability`

- **Auth:** Protected
- **Input:** `{ roomId, startAt, endAt }`
- **Output:** `{ available: boolean }`
- **Description:** Returns whether a room is free for a time slot; **known gap G13** — not yet integrated into booking creation (tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`)

### `room.relocate`

The successful mutation also best-effort updates the existing offline Calendar event's room/location, description heading, and schedule after commit. It never adds conference data or a Meet URL.

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Moves a booking to a different room, freeing the previous one. The admin UI invokes this from the booking detail Offline room card after the operator selects the booking contextually.

### `room.cancelBooking`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ cancelled: true }`
- **Description:** Cancels a booking's room assignment. While the booking is awaiting room approval, this releases its holds and transitions it to `cancelled`; it also handles pending approvals that have no room-booking row because the requested room was unavailable. The UI confirms this destructive action before sending the mutation.

---

## Notification (`notification.*`)

### `notification.list`

- **Auth:** Protected
- **Input:** `{ unreadOnly?, limit?, cursor? }`
- **Output:** `{ items: Notification[], nextCursor }`
- **Description:** Includes in-app contact-request notifications when applicable. These notifications contain request metadata and human-readable names only; contact email is never stored in the notification body or metadata. Retired economy rate-change notifications are excluded from the inbox.

### `notification.getUnreadCount`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`
- **Description:** Returns the number of unread notifications for the user

### `notification.markAsRead`

- **Auth:** Protected
- **Input:** `{ id }`
- **Output:** `{ notification }`

### `notification.updateReadStatus`

- **Auth:** Protected
- **Input:** `{ ids: string[], isRead: boolean }` — `ids` contains 1–100 notification IDs
- **Output:** `{ success: true }`
- **Description:** Updates the read state for selected notifications owned by the authenticated user; `isRead: false` marks them unread

### `notification.markAllAsRead`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ count }`

---

## Admin Booking (`adminBooking.*`)

### `adminBooking.applyOverride`

- **Auth:** Admin
- **Input:** `{ bookingId, category, reason, affectedParticipants?, marksAction?, userNote?, internalNote? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel). Omit `affectedParticipants` and `marksAction` to use the automatic category policy (the web client always does this): `student_no_show` forfeits student holds and preserves tutor payout eligibility; every other category returns student holds and withholds tutor payout. Explicit legacy values remain accepted for backwards compatibility (`marksAction`: release_holds/compensate_credit/compensate_deduct).
- **Output:** `{ booking }` — the updated booking; resolved financial policy is recorded in `overrideMeta`
- **Errors:** `BOOKING_NOT_FOUND` (404), terminal-state override rejected (`TERMINAL_STATE_OVERRIDE`, 409 — message names the final status, e.g. "This booking is already completed and can no longer be overridden. Final bookings are locked — check state history or use a wallet correction if Marks need fixing.")
- **Description:** Force state transition bypassing the state machine; optionally adjusts held Marks per participant; records audit log + state history + participant notification
- **Frontend note:** The admin override form reads the booking roster through protected `booking.get` and presents a read-only student/tutor impact roster in a bottom drawer on mobile and a right-side drawer on desktop. The independently scrolling body keeps Preview/Override actions available in the fixed footer. The web client omits `affectedParticipants` and `marksAction`, so the selected category determines all wallet, payout, and notification effects automatically. Its review card presents booking-state, named wallet-balance, and tutor-payout outcomes before apply.

### `adminBooking.previewOverride`

- **Auth:** Admin
- **Input:** Same as `applyOverride`
- **Output:** `{ bookingId, currentState, projectedState, affectedParticipants, marksAction, tutorPayoutEligible, perParticipantImpact }` — no persistence. `affectedParticipants` includes students and tutor for notifications; `perParticipantImpact` contains student wallet movements.
- **Errors:** Same terminal-state rejection as `applyOverride` (`TERMINAL_STATE_OVERRIDE`, 409)
- **Description:** Returns the projected booking state and per-participant wallet impact before applying

### `adminBooking.listBookings`

- **Auth:** Admin
- **Input:** `{ bookingId?, search?, limit?, cursor?, category?, urgency?, escalated? }` (`search` accepts an exact human-readable booking number such as `12` or `#12`; `category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel/tutor_lateness_pending — `tutor_lateness_pending` lists sessions flagged by the lateness sweep for admin review)
- **Output:** `{ items: (Booking & { bookingNumber: number, reportedAt: string | null, slaDeadline: string | null, escalated: boolean })[], nextCursor }`
- **Description:** Paginated booking list sorted by urgency. Every booking has an immutable global `bookingNumber` used as the short `#N` reference; the UUID `id` remains the internal route/relationship key. Supplying `search` filters to that exact booking number. Supplying `bookingId` performs the exact admin lookup used by `/admin-operations/bookings/:bookingId`, returning zero or one item so the detail page remains refresh-safe. For override reports, `reportedAt` comes from `overrideMeta.overriddenAt`, `slaDeadline` applies OQ-04 (30 minutes Mon–Sat 09:00–21:00 WIB, otherwise 4 hours), and `escalated` is computed against that business-hours deadline.

### `adminBooking.getBookingStateHistory`

- **Auth:** Admin
- **Input:** `{ bookingId }`
- **Output:** `{ items: BookingStateHistory[] }`
- **Description:** Returns full state transition history for a booking. The admin-only booking detail page uses this procedure to render the chronological review timeline.

### `adminBooking.adminRefund`

- **Auth:** Admin
- **Input:** `{ paymentId, reason }`
- **Output:** `{ correction }`
- **Description:** Issues a compensating ledger entry for a payment error. **In-app Marks credit only (N1, PRD §677):** credits the payer's wallet with the spend-adjusted refundable Marks, marks the payment REFUNDED, and writes a `refund_record` with `amount_idr = 0` and no `provider_event_id`. The payment provider is **never** called (purchased Marks are not convertible back to rupiah; no cash moves). **Per-payment FIFO attribution (F11):** spend is attributed to the user's credit-state payments oldest-first (`listCreditStatePaymentsForUser`), so refunding a payment whose own Marks were spent rejects with `REFUND_SPEND_EXHAUSTED`, while an unspent payment refunds its full remaining Marks (capped at the wallet's current available balance) — a refund never credits Marks that belonged to a different, already-spent payment. Errors: `BOOKING_NOT_FOUND` (404) for unknown payment/wallet, `INVALID_REFUND_STATE` (400) unless the payment is PAID/SETTLED, `REFUND_SPEND_EXHAUSTED` for fully-spent payments.

### `adminBooking.setMeetingLink`

- **RPC path:** `/rpc/adminBooking/setMeetingLink`
- **Auth:** Admin
- **Input:** `{ bookingId, url }` (`url` must be an `http://` or `https://` URL, max 2048 chars)
- **Output:** `{ bookingId, meetingUrl, status }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) unless the booking is online and `SCHEDULED`/`CONFIRMED`
- **Description:** Records or replaces a manual meeting URL on an online booking as fallback when Google Meet generation failed or is disabled (U1/FR-21); only `SCHEDULED`/`CONFIRMED` bookings are editable. It updates the newest meeting-attempt row so the booking detail reads the active link, notifies confirmed participants, and writes an `admin_set_meeting_link` audit record.

### `adminBooking.cancelSeriesSession`

- **RPC path:** `/rpc/adminBooking/cancelSeriesSession`
- **Auth:** Admin
- **Input:** `{ sessionId, marksAction, amount? }` (`marksAction` one of `release`/`forfeit`/`partial`; `amount` required when `partial`, max 1000)
- **Output:** `{ sessionId, currentState: "cancelled", marksAction, affectedParticipants }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_STATE_TRANSITION` (409) if the session is not `scheduled`
- **Description:** Cancels a single scheduled series session; the booking, child, and participant holds are locked and refreshed before settling, then the child transition is conditional on `scheduled` (U6/TC-31). The parent hold is recalculated from remaining confirmed/reconfirmed participant holds, excluding pending invitees. Solo series therefore reflect the proposer hold; group series reflect each confirmed participant's package. The booking reschedule lock serializes cancellation with proposal acceptance. It records audit + participant notifications; a concurrent completion that wins leaves settlement untouched and the cancel is rejected.

---

## Refund (`refund.*`)

### `refund.createCorrection`

- **Auth:** Admin
- **Input:** `{ walletId, amount, type, reason, bookingId? }` (`type` one of `compensate_credit`/`compensate_deduct`, `amount` > 0)
- **Output:** `{ walletId, type, amount }`
- **Errors:** `WALLET_NOT_FOUND` (404)
- **Description:** Admin-only: creates a compensating ledger entry for wallet corrections; records a `refund_record` + audit log

### `refund.listCorrections`

- **Auth:** Admin
- **Input:** `{ walletId, limit?, cursor? }`
- **Output:** `{ items: LedgerEntry[], nextCursor }` — only `compensate_credit`/`compensate_deduct` entries

---

## Support (`support.*`)

### `support.createTicket`

- **Auth:** Protected
- **Input:** `{ category, bookingId?, description }` (`category` one of tutor_late/tutor_no_show/technical/payment/other; `description` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_BOOKING_ACCESS` (400) — lateness categories require the reporter to be a participant; `LATENESS_REPORT_TOO_EARLY` (400) — booking must have started > 15 min ago
- **Description:** Reports a tutoring lateness/no-show or another issue; lateness/no-show categories require an associated booking started > 15 minutes ago

### `support.listTickets`

- **Auth:** Protected
- **Input:** `{ status?, limit? }`
- **Output:** `{ items: Ticket[] }`
- **Description:** Returns the authenticated user's support tickets

### `support.adminListTickets`

- **Auth:** Admin
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Ticket[], total, limit, offset }`
- **Description:** Returns all support tickets sorted by SLA urgency (earliest deadline first)

### `support.adminResolveTicket`

- **Auth:** Admin
- **Input:** `{ ticketId, resolution }` (`resolution` max 2,000 chars)
- **Output:** `{ ticket }`
- **Errors:** `SUPPORT_TICKET_NOT_FOUND` (404), `SUPPORT_TICKET_ALREADY_RESOLVED` (409)
- **Description:** Resolves a ticket, assigns the admin, notifies the reporter, and records an audit log

> SLA auto-escalation: the `escalate-support-tickets` scheduler job (15 min) marks open tickets past `slaDeadline` as `in_progress` + escalated (OQ-04 in-app part, #46), with `whatsappTarget: "+62881011990195"` in the escalation notification metadata for the future adapter. The web support actions confirm `+62 881-0119-90195` before opening WhatsApp in a new tab.

---

## Upload (`upload.*`)

### `upload.createUploadUrl`

- **Auth:** Protected (F19 — intentionally NOT student-only: any authenticated role may mint a bounded upload URL; the tutor proof-file path needs it)
- **Input:** `{ filename, contentType, contentLength }` (`contentType` one of `image/png`/`image/jpeg`/`image/webp`/`image/gif` — photo flows are image-only, `application/pdf` is rejected; `filename` max 255 chars, no `..`/leading `/`; `contentLength` is an integer from 1 byte through 5 MB)
- **Output:** `{ uploadUrl, key, publicUrl, contentType, maxBytes, method, fields }` (`maxBytes` 5 MB; `method: "PUT"` for R2 and `"POST"` for local mode; `fields` is `{}` for both current backends)
- **Errors:** `INVALID_CONTENT_TYPE` (400), `INVALID_FILENAME` (400); local-mode `POST /uploads/*` returns 415 when the body bytes are not a recognized image (magic-byte sniff) and 413 when over the size limit
- **Description:** Returns a Cloudflare R2 presigned PUT URL whose key, content type, and declared content length are signed, or a local URL (dev, authenticated `POST /uploads/*`) for uploading a file. Browser clients using R2 require bucket CORS for the frontend origin. Uploaded objects are referenced by `key`/`publicUrl` (e.g. private achievement `evidenceUrl`, public `documentationUrl`, or user avatar). Local files are served via `GET /uploads/*` when `R2_PUBLIC_URL` is unset. The nightly `infra/r2-upload-audit.sh` HEADs bucket objects and alerts on ContentType vs key-class mismatches

## Tutor payout profile fields (2026-10-21)

`/rpc/tutor/updateMyProfile` accepts private bank-account fields and tax-profile strings (`taxLegalName`, 16-digit `nik`, optional `npwp`) inside the standard `{"json": <input>}` envelope. NIK/NPWP remain strings so leading zeroes are preserved. `/rpc/tutor/getMyProfile` returns those fields only to the authenticated tutor; public tutor discovery and `/rpc/tutor/getMyPayoutFinance` omit them. Existing published tutors may keep teaching with an incomplete tax profile; legal name and NIK are required before a new payout is prepared. `/rpc/tutor/submitForReview` does not require tax identity.

Only exact bank name `BCA` is fee-free; all other bank names incur Rp2,500 once per batch. `/rpc/tutor/getMyPayouts` with no date filters returns own honorarium compatibility summary; `/rpc/tutor/getMyPayoutFinance` returns the own gross/rate/tax/fee/net/session/history view. Admins use `/rpc/admin/getPendingTutorPayouts`, `/rpc/admin/previewTutorPayout`, `/rpc/admin/prepareTutorPayout`, and `/rpc/admin/recordTutorPayoutTransfer` for the versioned two-step external transfer workflow. Admin APIs also provide audited tax defaults/overrides, reasoned void, and reconciliation resolution. No RPC executes a bank transfer.

Numeric Marks fields returned by wallet, booking, pricing, and analytics procedures remain numbers. The web client presents those values with the shared `CogitoMarks` symbol component; this is presentation-only and does not change RPC inputs or outputs.

The 2026-09-08 Invite Tutor card height and Invitations pagination alignment corrections are presentation-only; tutor invitation RPC paths, envelopes, inputs, and outputs are unchanged.
