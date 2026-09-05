# Cogito App — Codebase Context

Last updated: 2026-09-04

## Server-backed table pagination (2026-09-04)

All database-backed tables in the web app now paginate at the API/database
boundary. Student and admin achievement lists, the active-room catalog, and
pending-room approvals use deterministic offset pages; the admin booking queue
and wallet ledger use cursor pages; and Manage Tutors continues to use its
independent offset pages. The UI requests a bounded page plus one sentinel row
when it needs to discover `hasNext`, keeps previous rows visible through
`keepPreviousData`, scrolls the owning card back into view after navigation, and
resets pagination when filters or the selected wallet change.

Achievement status cards use dedicated `achievement.stats` and
`achievement.adminStats` aggregates, so counts do not describe only the
visible page. `pending` aggregates both `pending` and legacy `pending_review`.
The unpaginated `room.list` compatibility path remains available for the
booking room selector. The economy schedule preview and tutor pricing matrix
are finite configuration/reference tables, not database collections, so they
remain intentionally unpaginated.

## Tutor discovery filter viewport containment (2026-09-04)

The student `/tutors` page bounds its search row and collapsible filter panel
with shrinkable, full-width containers so responsive controls cannot create a
wider intrinsic page than the viewport. Shared Selia select positioners and
popups also cap their width at Base UI's `--available-width` boundary, keeping
category and specialization options inside the available viewport when
multiple values are selected. This is frontend-only presentation behavior; no
RPC, schema, persistence, or operational contract changed.

## Tutor discovery profile presentation (2026-09-04)

The student tutor drawer mirrors the public tutor profile treatment with a
full-width 300px hero using the published profile image, top-aligned cover
cropping, a bottom gradient, a close affordance, and specialization badges
overlaid at the bottom. Education, achievements, and experiences render inside
one combined **Achievements & experience** panel, while legacy achievement and
experience text remains a fallback for older profiles. Tutor cards keep their
desktop metadata on one line with natural-width specialization labels that do
not repeat the parent category, reveal one, two, or three badges at
progressively wider breakpoints, and retain a `From [Marks icon] #` price
label; no RPC, schema, or persistence contract changed.

## Student dashboard balance widget (2026-09-04)

The student dashboard replaces its standalone Knowledge Bank promo card with a
compact Selia balance widget inspired by the Watermelon quota-card composition.
It shows available Marks as the primary value, held and total Marks as supporting
values, and links to the Balance page for top-up. The Balance page reuses the
same widget beside its Knowledge Bank access card on desktop. Eligibility uses
the canonical total-balance threshold of 35 Marks. This is presentation-only
and adds no new data source.

The reusable widget keeps its dashboard **Top up** CTA by default; the Balance
page configures the same action as **Find a tutor** and routes to `/tutors`,
which is the next step before creating a booking.

The Balance page and reusable widget explicitly allow their grid/flex children
to shrink on narrow screens. Held and total values use equal bounded columns,
and mobile ledger amounts move below their transaction descriptions so Marks
history cannot impose a desktop-sized intrinsic width on the entire page. The
QRIS payment code also scales to the nested card's available width instead of
enforcing a fixed 272-pixel padded box.

Marks history renders the transaction date on its own metadata line below the
reason. Transaction amounts and resulting balances use the shared `CogitoMarks`
icon-prefix presentation instead of spelling out Marks as a text suffix.

## Card title info preview (2026-09-04)

The shared Selia `Card` now provides `CardInfoPreview`, an optional inline slot
that places the existing `InfoPreview` popover trigger directly beside
`CardTitle`. `InfoPreview` also accepts a custom icon alongside its accessible
label, title, and explanatory content. The admin dashboard's Booking activity
card uses this composition instead of a separate header description. The shared
booking-detail surface follows the same treatment for Session overview, Series
sessions, Activity, Honorarium/Marks, lifecycle, contact, room-assignment, and
admin-extension cards. This is presentation-only and changes no RPC or
persisted data contract.

## Competition Calendar empty months (2026-09-04)

The authenticated Competition Calendar keeps the normal month grid visible when
the selected month has no events. Dates, weekday headings, outside-month cells,
and month navigation remain available; the month view does not replace the grid
with an empty state. The page-level empty state is still used when no published
competitions exist at all, while the agenda view may continue to explain an
event-free selected period. This is frontend-only and changes no API, schema, or
persistence contract.

## Sidebar booking-action badge (2026-09-04)

The authenticated sidebar now shows a compact count badge beside the shared
`/bookings` navigation item when the role-visible booking list contains rows in
the same pending states used by the **Needs action** tab. The badge uses the
existing protected `booking.listMine` read with those states, displays `99+`
when the result exceeds the compact limit, and stays hidden while the count is
zero or still loading. The state tuple is shared by the sidebar, booking list,
and booking cards. This is frontend-only; no RPC, schema, persistence, or
booking lifecycle rule changed.

## Sidebar logo contrast (2026-09-04)

The authenticated sidebar keeps the branded `/cogito-academy-logo.webp` asset
in light mode and applies a dark-mode filter so the complete logo renders
white, including both the wordmark and academy label. This is frontend-only
presentation behavior with no RPC, schema, persistence, or operational
contract change.

## Sidebar navigation order (2026-09-04)

The authenticated sidebar keeps its three semantic zones: role-specific primary
navigation, shared resources, and the account menu in the footer. Student
navigation follows the main journey (`Dashboard`, `Tutors`, `My Bookings`,
`Balance`, `Achievements`); tutor navigation prioritizes work actions
(`Dashboard`, `Bookings`, `Availability`, `Tutor Profile`); and admin navigation
starts with the action queue (`Dashboard`, `Operations`, `Bookings`, `Tutors`,
`Economy`, `Achievements`). Resource labels and the **Tutor Profile** wording
remain unchanged. This is frontend-only presentation behavior with no RPC,
schema, persistence, or operational contract change.

## Human-readable booking references (2026-09-04)

Every booking now receives an immutable global `bookingNumber` from a
PostgreSQL sequence. The admin Operations → Booking queue renders this short
reference as `#N` instead of the long UUID and accepts exact searches in either
`N` or `#N` form. The UUID remains the internal route and relationship key, so
existing booking links, audit records, wallet references, and lifecycle logic
do not change. Sequence values are intentionally allowed to have gaps when a
booking transaction is rolled back, matching the normal behavior of PR/issue
number sequences.

## Production UI and E2E audit (2026-09-04)

The authenticated web shell now exposes a semantic skip link, an accessible
sidebar toggle with `aria-expanded`/`aria-controls`, and a page-level `h1`
hierarchy without using the visual navigation title as a heading. Tutor cards
are native buttons, the production bundle excludes router/query devtools, and
responsive booking tabs keep overflow inside their own scroller down to the
tested 170px viewport. Time-sensitive labels share a visibility-aware
30-second clock hook, and the achievement dismissal state is SSR-safe.

The complete browser workflow passed **13/13 tests across four specs** on
2026-09-04. The suite resets and seeds deterministic users, reuses one
authenticated student storage state to respect the auth rate limit, covers
solo/offline-group/online-group booking transitions, tutor decline, access
denial, contact privacy, economy roles, and 170px/390px layout containment.
The responsive layout assertions are order-independent and accept either a
real booking row or an empty collection state.

On 2026-09-05, the CI browser setup was tightened to install Chromium from
`packages/e2e`, where the locked Playwright dependency is resolved. This keeps
the installed headless-shell revision aligned with the browser tests instead
of allowing a repository-root transient CLI to select a different revision.

Production payment checkout defaults to Xendit QRIS. The provider sends
QRIS-specific channel properties (`qr_string_type=DYNAMIC`, 48-hour expiry),
and the Balance page renders the returned QR payload instead of treating it as
a fetchable redirect URL. `XENDIT_DEFAULT_PAYMENT_METHOD` is declared in the
production examples and Coolify env synchronization list.
A Midtrans Snap provider (`PAYMENT_PROVIDER=midtrans`) is implemented behind
the same `PaymentProvider` port (2026-09-03, `docs/MIDTRANS-MIGRATION.md`):
Snap returns a hosted `redirect_url`, the webhook `signature_key` is verified
in the body (`SHA512(order_id + status_code + gross_amount + key)`), statuses
map `capture`→PAID / `settlement`→SETTLED / `pending`→PENDING /
`deny|cancel|failure`→FAILED / `expire`→EXPIRED / `refund|partial_refund`→
REFUNDED, and `order_id` is the payment UUID (unique per repurchase attempt).
Midtrans Sandbox has no simulation endpoint, so `canSimulate` is false in
Midtrans mode. Xendit remains the default and the rollback path.
Approved UAT accounts also receive a Test Mode-only simulation action. The API
validates payment ownership and mode and calls Xendit's official simulation
endpoint. Marks are credited only after Xendit reports a successful status.
Structured Xendit HTTP failures preserve only a bounded status, error code, and
message so UAT can distinguish a key/permission or request-validation problem
from a genuine provider outage without exposing credentials.
When a retry hits Xendit's `INACTIVE_PAYMENT_METHOD` response after a previous
simulation, the service checks the authoritative payment-request status once
and reuses the idempotent confirmation path if the payment already succeeded.
As a sandbox reliability fallback, approved-user status polling reads the
authoritative Xendit payment-request status and feeds terminal results through
the same transactional, idempotent confirmation path.
Payment packages are repeatable: the latest PENDING attempt is reused for a
resume-safe checkout, while PAID, SETTLED, FAILED, EXPIRED, and REFUNDED
attempts remain history and never block a new payment row/provider reference.

## Website audit P2 hardening

User-supplied links used by achievements, tutor verification/profile photos,
and manual meeting-link flows accept only bounded `http://` or `https://`
URLs; generated local profile assets may use the bounded `/uploads/...` path.
Achievement and tutor-profile moderation decisions use the persisted
row version as an optimistic compare-and-swap, preventing two admins from
silently overwriting each other or producing duplicate side effects. BullMQ
jobs are copied to the DLQ only after their configured retry budget is
exhausted; intermediate failures remain in the normal retry flow.

CI pins oxlint 1.80.0 and oxfmt 0.65.0. Known legacy React compiler errors
remain explicitly tracked in `.github/lint/baseline.txt`; new findings fail
the baseline gate. Lefthook and CI both run the cross-platform
`.github/lint/check-baseline.ts` checker, so documented legacy findings do not
make every push fail while new errors still block both local pushes and CI.
The lint auto-fix commit disables
Lefthook while pushing so the workflow's dedicated baseline and formatting
checks are authoritative.

## Tutor Terms of Service acceptance (2026-09-02)

The first complete tutor onboarding submission presents the bilingual
Indonesian/English Terms of Service from
`apps/web/src/components/tutor/tutor-terms-of-service.tsx`. Draft saves do not
require consent, and cancelling the dialog leaves the profile in its current
draft/revision state.

The server accepts `acceptTerms?: boolean` on `tutor.submitForReview`, enforces
acceptance when the tutor profile has no prior consent, and writes
`terms_of_service_accepted_at` plus `terms_of_service_version` (`2026-09`) once
in the same transaction as `pending_review`. Later review submissions do not
need the flag. These fields are available to the tutor-owned profile response
but are explicitly removed from public tutor discovery. The sticky onboarding
action area also exposes a read-only **View Tutor Terms** action after
acceptance.

## Deployment wave state

**APPLIED (2026-08-31).** The full Terraform + Ansible apply chain completed via `infra/apply.sh`:

- **Terraform**: 7 resources in state (R2 buckets `cogito-infra-state`/`cogito-backups`/`cogito-bucket` + DNS `api.`/`app.`/`status.`/`cl.`), zero drift, state in R2. The `r2bucket.cogitoacademy.id` custom domain is console-managed (provider v5 has no import for it — #133).
- **Tailscale + hardening**: VPS joined the tailnet (`cogito-vps`), UFW tailnet-only for 22/8000/6001/6002, fail2ban + unattended-upgrades on.
- **Coolify resources**: project `cogito` / env `production` declared; databases `cogito-prod-db` (postgres:16-alpine) + `cogito-prod-redis` (redis:7.2) drift-checked; applications `cogito-api` + `cogito-web` declared; **47 env vars applied to cogito-api from the SOPS vault**; deploy-webhook route live on `cl.cogitoacademy.id` (probe returns 401 = auth-required form; CD sends `Authorization: Bearer`).
- **Backup cron**: nightly 02:00 WIB `pg_dump -Fc` → `cogito-backups` (30-day retention), env at `/etc/cogito/backup.env`, log `/var/log/cogito-backup.log`. AWS CLI v2 detected at `/opt/cogito-actions-tools/bin/aws` (noble dropped the apt package — #137).
- **Monitoring (2026-09-01)**: Uptime Kuma declared as a Coolify service (`cogito-uptime-kuma`, `louislam/uptime-kuma:2`, port 3001, volume `uptime-kuma-data:/app/data`) at `status.cogitoacademy.id` via `infra/ansible/uptime-kuma.yml` (Coolify API, control-node driven, idempotent); disk watchdog `infra/ansible/disk-watchdog.yml` installs `/usr/local/bin/cogito-disk-watchdog.sh` (nightly 03:30 WIB, warn ≥ 85%, auto-prune ≥ 92% — never volumes/active images/postgres data, newest 1–2 cogitoacademy/app images kept for rollback); `ops.sh disk` + `deploy-retry` added. **Kuma wired 2026-09-02** (operator): 4 monitors + `COGITO ALERT` Discord attached + `cogito` status page — see `docs/KUMA-RUNBOOK.md`.
- **Vault**: R2/Coolify tokens rotated 2026-08-31; `DATABASE_URL` uses the container IP `10.0.1.8` (host-reachable for the cron; the app keeps the private hostname).

**Remaining (see `docs/plans/active/`):** drills (DEPLOYMENT-PLAN Phase 5), Xendit go-live, branch protection + `ACTIONS_BOT_PAT` (CI-SANITY F9/F10), and the planned cleanup of the remaining legacy React lint baseline.

**OPS-VISIBILITY-WAVE (2026-09-02/03, merged #179):** `docs/FAILURES.md` added (the
canonical failure → detection → recovery guide, incl. the disk-full
deploy-failure class and the "CD does not auto-retry" procedure); circuit
breaker states surfaced in `/health` (`checks.circuitBreakers`,
informational — live-verified 2026-09-03); DLQ queue job retention bounded
(`JOB_RETENTION` on `cogito-jobs-dlq`); `ops.sh` DB-name default fixed
(`postgres`) + `cb` command added; CD pre-migrate snapshots pruned beyond
the newest 7 (`PRE_MIGRATE_KEEP`); `infra/secrets/**` added to the
`infra-apply.yml` paths filter (vault-only merges now re-apply the env);
Kuma wired by the operator (4 monitors + `COGITO ALERT` Discord attached +
`cogito` status page — see `docs/KUMA-RUNBOOK.md`); disk-watchdog
verification procedure and memory-headroom recommendation documented in
RUNBOOK; CD `COOLIFY_API_BASE_URL` rollback-path fix (unbound-variable
crash during the 2026-09-02 disk-full incident). Plan moved to
`docs/plans/completed/`.

## Stable collection transitions (2026-08-28)

The admin tutor Invitations and Tutor Profiles tables use TanStack Query's
`keepPreviousData` placeholder while a page or status filter changes. Their
pagination controls target the owning card IDs (`admin-tutor-invites` and
`admin-tutor-profiles`) and scroll that card into view after a page change, so
only the selected collection becomes the user's visual focus. This is handled
with an element anchor and `scrollIntoView`; pagination does not add a route
query or hash parameter. Tutor discovery applies the same stale-data pattern
when search or filters change, and the admin booking queue applies it while
its server-side filters reload. Wallet lookup and student search intentionally
show only results for the submitted query because retaining another user's
data would be misleading. Notifications already retain loaded pages through
`useInfiniteQuery`.

Student cancellation closes at the exact scheduled start and requires a written reason that is persisted in activity and shared with the tutor. Tutor request declines and student/tutor reschedule proposals likewise require a non-blank reason at the API boundary. The backend rejects `booking.cancel`, participant `withdraw`, and per-series-session cancellation at or after the applicable `scheduledStartAt`, leaving the booking live for tutor completion; the booking-detail UI hides the primary cancel action on the same boundary. Pre-start H-2 penalties remain unchanged. Attendance or delivery problems after start use support/admin review instead of allowing a student cancellation path to strand tutor payout.

The shared `/bookings` surface is task-oriented with Needs action, Upcoming, Recurring, History, and All tabs. Students and tutors are taken to Needs action when a response is pending. History consolidates terminal outcomes. URL-backed Recommended sorting keeps pending decisions above active bookings and terminal outcomes at the bottom, with Soonest and Latest alternatives.

## Admin wallet lookup search (2026-09-02)

The Operations → Wallet lookup surface first searches the admin-only
`admin.searchUsers` procedure by case-insensitive partial name, email, or user
ID. It returns a bounded identity projection (`id`, `name`, `email`, `image`,
and `role`) with exact email/ID matches ranked first; the admin then selects a
result before `admin.getWallet` and `admin.listLedgerEntries` load the wallet.
Search results are replaced only after the submitted query completes, and
wildcard characters are treated literally.

The shared booking list consumes `booking.listMine` with cursor-based infinite
loading in batches of 20. Loaded cards remain visible while **Load more
bookings** fetches the next cursor, so large histories do not require an
unbounded first response or replace the current screen. Tabs and sorting still
apply client-side to the loaded pages; tab counts show `+` while more pages
remain because they are lower bounds until the list is fully loaded.

Shared booking cards include a compact time indicator. Deadline-bound pending states use the server-provided `deadlineAt` to show `Respond in`, urgent, or overdue messaging; confirmed/scheduled bookings show Today, Starts in, Starting soon, or In progress when relevant. Terminal bookings show no time indicator. One shared client clock refreshes all visible cards every 30 seconds.
In booking lists, this indicator sits after the role-appropriate financial summary (Marks for students/admins, IDR honorarium for tutors) with a vertical divider. Dashboard next-lesson cards hide their financial summary to keep the compact overview focused on people, timing, and the detail action.

## Production deployment topology

The public company profile remains on the apex `cogitoacademy.id` host at
Hostinger. The deployed Cogito application uses separate subdomains: the API
and Better Auth base URL are `https://api.cogitoacademy.id`, while the web app
and CORS origin are `https://app.cogitoacademy.id`. The production frontend
image must be built with `VITE_SERVER_URL=https://api.cogitoacademy.id`; the
static nginx image does not proxy `/rpc` to the API.

The PostgreSQL service currently runs as Coolify's private `postgres:16-alpine`
container and does not serve TLS. Production-like API deployments therefore set
`DB_SSL_ENABLED=false`; `DB_SSL_REJECT_UNAUTHORIZED` only controls certificate
verification when TLS is enabled, and should remain `true` for a managed or
external PostgreSQL endpoint that requires TLS.

Production-like server boot reconciles the comma-separated `ADMIN_EMAILS`
allowlist before serving traffic. It defaults to
`itcogitoacademy01@gmail.com`, matches case-insensitively, promotes matching
existing accounts, and never demotes other admins. The Better Auth signup hook
covers a matching account created after boot. The guarded production seed uses
a separate `SEED_REVIEW_ADMIN_EMAIL` and refuses to reuse any address in
`ADMIN_EMAILS`; local/test seed keeps `admin@cogitoacademy.id`. Its review
student has verified local authentication and seeded Marks, while its review
tutor has a published structured profile, normalized specializations, and future
availability. The Google Calendar operator password is never part of reviewer
credentials. Additional admins can still be granted through the existing admin
role management flow.

The OVH host bootstrap is repeatable through the Terraform configuration in
`infra/terraform`, which runs the idempotent `infra/provision.sh` over SSH for
an already-created VPS. The bootstrap keeps SSH password authentication off,
allows only Coolify's generated key for its localhost root connection, and
exempts Docker's private range from fail2ban so internal validation cannot
self-ban. Coolify's service/resource setup remains a one-time control-plane
operation. The end-to-end provisioning, release, manual CI-quota fallback,
verification, and rollback procedure is documented in [Setup and Deployment](./DEPLOYMENT.md).

The authenticated `/guide` route is the product-facing **How Cogito Works** guide. It is a frontend-only, code-managed journey map rather than a developer setup document. Students can see only the Student journey; tutors can switch between Tutor and Student; admins can switch between Admin, Tutor, and Student. The role selector sits on its own at the top of the page, while the introduction and journey sit in a centered `max-w-6xl` guide shell. Step details open by default so the full flow can be read without one-by-one interaction; a single global control can collapse or restore all details, while each step remains individually keyboard-accessible. Each view combines a detailed tutoring lifecycle timeline with expandable exception branches and links to the existing feature routes; desktop uses a sticky secondary chapter rail on the right with one restrained progress header and Selia `Item` rows with a semantic media tint for chapter wayfinding, while mobile stacks the same navigation above the content. Its Scandinavian treatment uses a neutral, sans-serif hierarchy, restrained borders, purposeful whitespace, and smooth reduced-motion-aware details so the guide works for learners from ages 5–18 as well as tutors and admins. Timing-sensitive copy is explicit and bolded in the rendered guide: invite links last 7 days; booking response, participant confirmation, reconfirmation, and room approval use 12-hour windows unless the session starts sooner; student self-service changes close at H-2 (2 hours before start); reschedule proposals last 24 hours; lateness is measured at 15 minutes; meeting retries run every 5 minutes for up to 3 attempts; and the admin support SLA is 30 minutes in business hours or 4 hours outside. The static content source is `apps/web/src/components/guide/guide-content.ts`; no API or database contract is involved.

The app-wide TanStack Router pending state is rendered by `apps/web/src/components/loader.tsx` as a visible token-based loading ring with a contrasting track, the local Selia `Spinner` component as its primary progress arc, a loading label, and reduced-motion behavior. It is presentation-only and keeps the same router/onboarding/auth loading entry points.

Unknown client-side paths render the branded `NotFoundPage` from the root route instead of TanStack Router's generic `Not Found` fallback. Route and outer-boundary failures use the matching `ErrorPage` status treatment with a single tertiary browser-back action. Network failures across query and auth surfaces are normalized by `apps/web/src/lib/error-message.ts`; technical messages such as `Failed to fetch` become plain-language connection guidance without changing any API or persistence contract.

The profile and tutor-onboarding routes keep every Selia `FieldLabel`, `FieldDescription`, and `FieldError` under a `Field` root, including checkbox copy and section-level validation messages. This preserves Base UI field context when validation errors render; otherwise Base UI error #28 reaches the outer error page and can look like a misleading 500. This is frontend-only and does not change an API or persistence contract.

The tutor profile editor uses the authenticated shell's page-level vertical
scroll container, matching the student profile instead of nesting a second
scrollable region inside the page. The shell keeps direct page children from
flex-shrinking, and the tutor profile wrapper therefore follows the onboarding
content's natural height instead of stopping at the viewport height.
The normalized specialization-category grid uses content-sized fieldsets so shorter
categories do not stretch into large blank areas, and the final action card
stays in normal document flow so the page ends without trailing scroll space.
This is presentation-only.

All roles use Better Auth `user.name` as the single canonical visible name.
Tutor onboarding edits that account name directly and no longer submits
`tutorProfile.displayName`; tutor
discovery, booking, dashboards, sidebar, and admin review render `user.name`.
The legacy tutor-profile column and compatible response key remain temporarily,
but the response key is projected from `user.name` and new UI does not depend on
the stored legacy value.

Collection empty states use the shared presentation component at `apps/web/src/components/empty-state.tsx`. `EmptyStateCard` is used for page and card-level states, while `EmptyState` supports `default`, `compact`, and `inline` density for calendars, menus, dialogs, fields, and embedded lists. Empty copy distinguishes a genuinely empty collection from a filtered no-match state; the component uses Selia tokens and provides success, warning, secondary, and danger tones without changing any API or persistence contract. The audit covers calendar periods, resource and tutor discovery, bookings, notifications, session/activity history, Marks ledgers, specialization selection, tutor proof links, and availability previews.

Invitation history keeps metadata but never stores plaintext invite secrets. The latest generated link remains visible and repeatedly copyable during the current admin page session. For any pending history entry, **Generate & copy link** rotates the token, invalidates the previous link, and records the existing resend audit action.

Before submission, the admin tutor invite form checks whether the normalized email is registered and displays the user's current role and linked Better Auth methods (Google, email/password, or both). This preflight is admin-only and resets whenever the email input changes.

Booking scheduling and reschedule rules: [Booking Scheduling and Reschedule Specification](./booking-scheduling-and-reschedule-spec.md) (v1.0.0, 2026-08-16). Student booking and reschedule forms expose 15-minute minus/plus controls, derive the fixed 90-minute end time, and show tutor-window validation only when the chosen start is outside the allowed range.

The student booking form uses a balanced responsive composition. At desktop widths, session format and the sticky booking summary occupy the right rail; availability remains a card grid, and selecting a slot expands that slot into a two-column row with its own start-time editor directly beside it. On narrower screens, the same editor stacks below its selected slot, modality returns to the start of the form flow, and the full summary moves into a bottom drawer opened from a persistent compact price/schedule preview; the drawer submit button remains associated with the booking form.

Booking list rows and the booking-detail header reuse the canonical
Calendar/Meet event-title format (`Cogito - {Competition} | {Tutor} x
{Student}`, with `& Friends` for groups), so participant names do not produce
long `+N` titles. This is a frontend presentation rule backed by the shared
`booking-event-title` formatter and does not change the booking RPC contract.

The authenticated `/dashboard` route is role-specific. Students retain the learning-first dashboard (next lesson, Knowledge Bank eligibility, competition calendar, and tutor recommendations). Tutors see booking decisions, next lesson, upcoming sessions, availability, profile status, and payout totals. The tutor dashboard prioritizes a two-row action-first layout: welcome and teaching setup share the first row, while requests to review and next lesson share the second row before metrics and payout details. The payout details card keeps the main metrics compact and exposes the unpaid-honorarium and transfer-fee explanations through shared accessible `InfoPreview` popovers. Student and tutor dashboards share the same `DashboardWelcomeCard` visual, including its SVG illustration, minimum height, spacing, and CTA structure, while keeping role-specific copy and destinations. Both student and tutor next-lesson sections reuse the same `BookingListCard` composition as the shared booking list, including its date tile, participant metadata, role-appropriate financial treatment (Marks for students, IDR honorarium for tutors), status tooltip, and detail action; the compact next-lesson card hides financial details to keep the overview focused. Admins see escalated booking operations plus pending tutor-profile and achievement review queues, as well as a Business insights section backed by the admin-only `admin.getDashboardAnalytics` aggregate procedure. That section offers 7/30/90-day WIB booking and audience trends, a live booking-state portfolio, modality/category signals, and Marks-based summary KPIs. All roles share the role-aware `/bookings` list/detail surface; the page keeps the same layout while adapting people, Marks, status, and permitted actions to the viewer. The authenticated shell uses the profile image in the sidebar user avatar when available and falls back to initials. Its theme menu supports Light, Dark, and System, and pressing `D` outside editable fields toggles between the currently rendered light and dark themes; the explicit selection remains persisted by `next-themes`. Booking rows use the Cogito mark icon as the Marks prefix, keep time/location/tutor in the booking metadata column, show student participants (not the tutor) in the avatar stack, use the per-student amount for a single-session group's `You pay` value, place financial/status metadata beside participant avatars, and expose status explanations through hover/focus tooltips. These dashboards are frontend compositions of their relevant oRPC procedures, with the admin analytics read documented in `docs/API-REFERENCE.md`.

The authenticated `/notifications` route is a focused inbox for durable in-app notifications. It uses cursor pagination, a category label badge, an exact date/time plus relative age, visible unread treatment, row selection, select-all for the currently loaded rows, and batch read/unread updates. Selected IDs are sent through the protected `notification.updateReadStatus` procedure, which scopes the database update to the authenticated user. The existing mark-all-read action and notification-bell unread count remain available. Bell items mark unread notifications as read and then navigate to the associated booking, balance, achievements, calendar, or notifications page; they no longer stop after changing read state. Retired economy rate-change rows are omitted from the inbox and unread count.

## Student contact privacy

Contact exchange is available only after a shared group booking reaches
`completed`. Eligible confirmed/reconfirmed student participants who were not
marked absent can see one another's name and profile image on the booking
detail, then send a lightweight in-app request with an optional note. This is
not a general directory or chat feature. Email and phone fields stay private;
the original requester sees the recipient's account email only after that
recipient explicitly chooses **Share email**. **Accept privately** records
consent to the connection without disclosing email, and **Decline** closes the
request. Incoming request projections never return the recipient's own email.

Each student can disable new requests from the profile's **Contact privacy**
setting. The API enforces the completed-booking, participant, attendance,
recipient-setting, and recipient-consent checks independently of the UI. Search
by email remains available for the existing group-invite workflow, but all
student-search, tutor-discovery, and booking participant responses return only
safe display identity; meeting attendee email arrays remain server-only.

## Authenticated editorial content

Competition Calendar and Knowledge Bank content are now delivered inside the authenticated app. Sanity remains the editorial source of truth; content is not duplicated into PostgreSQL. The API uses a server-side Sanity client with the `published` perspective and projects English values from the academy's bilingual competition fields. The app UI is English-only. Knowledge Bank category slugs are mapped to known labels or title-cased when rendered, while their raw values remain the filter keys.

- `content.listCompetitions` is protected for every authenticated role and powers `/_app/calendar`.
- The authenticated calendar keeps the academy's full read-only interaction model: month view with multi-day event spans and overflow popup, 30-day agenda view, keyboard shortcuts (`M`/`A`), period navigation, and a responsive event-details modal. Its colors, controls, and icons use the app's Selia design system; the academy's bilingual copy is not carried into the English-only app. The calendar route uses a contained viewport shell: the page heading and calendar toolbar stay in place while the calendar body owns vertical scrolling, and the month grid owns horizontal scrolling. A month with no events still renders the normal calendar grid so users can navigate dates; only the page-level no-competition state and event-free agenda period use empty-state messaging.
- `content.listStudentResources` powers the authenticated `/knowledge-bank` route for students, tutors, and admins. Students receive resources only after `wallet.knowledgeBankEligible` confirms the existing 35-Mark total-balance threshold (held Marks count); tutors and admins bypass that wallet threshold. Resource category slugs are presented as readable labels in the UI without changing the API values used for filtering.
- Knowledge Bank list responses never expose Sanity asset URLs. `GET /content/knowledge-bank/:resourceId/file` rechecks the student/tutor/admin role and wallet threshold, with the threshold bypassed for tutors and admins, fetches the published Sanity asset server-side, and streams it with private/no-store cache headers. The proxy is hardened (`apps/server/src/content-proxy.ts`): host allowlist (`cdn.sanity.io` / `*.sanity.io` — anything else is a 502 before any fetch), a 10s `AbortController` timeout, and a 5MB cap enforced on `content-length` and on the streamed body; the route is rate-limited 30/min per IP (`content` kind, `rate-limit-paths.ts`).
- The academy landing site remains bilingual. Its calendar and Knowledge Bank navigation uses app-login CTAs with an internal redirect target; the old localized URLs remain compatibility redirects rather than public content pages.

The shared booking list sorts active and all rows by the nearest scheduled start while keeping past/cancelled history newest-first. It defaults to Upcoming for students, Pending for tutors when requests need review (otherwise Upcoming), and All for admins; an explicit `tab` query parameter overrides the role-aware default. Dashboard next-lesson cards use the nearest future booking that is neither terminal nor pending, matching the list's Upcoming semantics. The tutor review queue keeps a stable empty/loading card so the requests and next-lesson modules remain visible together even when no review request exists.

On narrow screens, the rounded booking status-tab strip fills the available page width; only its inner tab list scrolls horizontally, with the native scrollbar hidden. Internal paint padding keeps selected-tab shadows and focus rings visible at either scroll edge, while shared empty-state cards preserve their rounded decorative glow and card shadow without widening the page. This is presentation-only and does not change the `booking.listMine` contract.

## Admin offline room workflow (2026-09-02)

The Operations → Room approvals tab is the cross-booking work queue for
offline bookings waiting for an admin room decision. A requested room can be
assigned directly from its row. Choosing a room or choosing another room
navigates to the admin-only `/admin-operations/bookings/{bookingId}` detail
page, where the admin sees the booking context and uses the Offline room card
to select, assign, relocate, or remove a room. The detail flow derives the
room window from the booking and never asks the operator to type a booking
UUID; the room RPC contracts remain unchanged and continue to receive
internal IDs.

The same tab also exposes an **Active rooms** catalog and an **Add room**
dialog. Admins enter the room name, physical location, and positive whole-
number learner capacity; successful creation calls the existing
`room.create` procedure and invalidates the shared `room.list` cache so the
new room is immediately available to offline booking and assignment selectors.
No schema or RPC input change was required.

The booking detail page uses participant `user.image` values with initials as the fallback, prefixes Marks values with `/cogito-mark.png`, and renders state history as a newest-first transition timeline (`fromState → toState`, actor type, timestamp, and reason). Each transition uses a context icon (users for participant actions, calendar for scheduling, map pin for rooms, and check/X/alert icons for outcomes) while the destination state remains the single colored status badge. The overview puts schedule first, merges modality and meeting/room state into a prominent `Format & access` subsection, and shows participant profile images, names, roles, and confirmation states in a compact responsive list. Role-appropriate primary booking actions, including propose, cancel, review, and complete, sit directly below the status badge, while contextual actions remain in the sticky desktop rail or main flow. Admin operations uses this same detail shell with admin-only review context, override, room, wallet/ledger, and history extensions; room approval monitoring remains in Operations → Room approvals, while booking-specific room actions are available on the admin booking detail page. For online sessions, meeting creation starts when the tutor accepts after required confirmations. A successful link moves the booking to `scheduled`; a failed Google attempt leaves it `confirmed` for the 5-minute retry job, while the assigned tutor or an admin can enter a manual fallback link. The detail page surfaces these states and refreshes while a link is pending. Manual-link entry updates the newest meeting-attempt row so the detail read stays consistent after multiple retries.

Online meeting status stays compact as an accessible Selia `IconInfoSquareRounded` trigger for both unavailable and available links. The popover contains the pending/failed explanation and retry/manual setup badge when needed; when `meetingUrl` exists, it contains the meeting-room action instead of a `Ready` badge or standalone CTA. Missing offline-room details and tutor completion timing use the same trigger beside the related status or action, opening the explanation on hover, focus, click, or touch. The booking detail also exposes a shared Selia manual-link dialog: the assigned tutor can add or replace a trusted URL for their own online `confirmed`/`scheduled` booking, and admin operations can add or replace it for any eligible online booking. Backend guards reject offline, terminal, pre-confirmation, and wrong-tutor requests. This is a small workflow/API follow-up rather than a schema change.

The booking detail overview merges the date and session hours into one `Date & time` field with a calendar-clock icon, then places Format & access beside it in a responsive two-column grid that stacks on narrow screens. The Participants heading uses the same Selia `IconBox` treatment as the other overview fields.

The booking detail desktop layout keeps the overview/activity flow in an independent left column from the sticky Actions/financial rail, so the rail height cannot create a blank grid row before Activity. Narrow layouts retain the order overview → actions/financial content → Activity. On the admin detail, offline room controls and participant wallet/ledger facts are embedded in Session overview, the participant list uses one column, review context sits in the right rail with Wallet impact, Marks amounts use the shared `CogitoMarks` icon-and-value component, and State history reuses the standard Activity timeline while retaining the admin-only actor identifier. This is presentation-only; no RPC, schema, or persistence contract changes.

Removing a room from a scheduled offline booking keeps the booking scheduled. Admins may subsequently assign a new room from the same overview controls; the backend permits this only when the booking is offline and has no active room assignment, preserving relocation as the path when a room is still active.

The booking proposer may propose or counter a time in the eligible pre-terminal states, including `confirmed` and `scheduled`, subject to the student H-2 checks. The proposed start minute must differ from the active booking/session schedule and from an existing pending proposal for the same target; the picker disables identical proposals and the service rejects them. Proposal replacement is serialized per booking, while a partial unique database index guarantees at most one pending proposal. A force-majeure or other emergency exception is not an automatic student reschedule after H-2; it must be handled through support/admin operations with an auditable reason and any applicable Marks decision.

Booking detail also renders the current response window for deadline-bound states (`awaiting_tutor_review`, participant confirmation, reconfirmation, room approval, and `reschedule_proposed`) in the booking timezone, refreshing the countdown every 30 seconds. The booking form validates a one-session group against the temporary target-headcount hold and shows that total explicitly; series and solo totals remain session-based. Seed tutor availability windows are at least two hours so the server-fixed 90-minute session has a valid UI start time, and seed demo students are email-verified so local booking smoke tests can pass the verified-student gate.

## Email notifications (P1/P2, PRD notification matrix)

- **Group/group-series invitee email (P1):** the invitee notification written by `booking.service.ts` (`createGroup`/`createGroupSeries`) carries the PRD-mandated content in its body — full schedule, per-student price, total Marks hold, the no-opt-out disclaimer (series only), and a direct in-platform CTA (`${CORS_ORIGIN}/bookings/{bookingId}`). Because `notification.write` uses `notif.body` as the email `html`, the CTA is present in both the in-app notification and the dispatched email.
- **Signup verification/welcome email (P2/G2):** a new email/password signup receives one `auth` email through Better Auth's email-OTP signup hook. The combined template includes the welcome/onboarding entry point, login link, brief platform intro, and six-digit verification OTP, saving one provider delivery compared with separate messages. Resends, legacy-account verification, sign-in OTPs, and password/change-email OTPs remain scoped to their existing authentication purpose; an existing-user sign-in never re-sends signup welcome copy.

## Tutor invite flow

Admin create/resend produces a single-use plaintext token, stores only its SHA-256 digest, and attempts delivery through the shared Resend provider. The branded invitation email explains the tutor value proposition, uses one primary profile-setup CTA, identifies the required account email, displays a readable UTC expiry, and includes the raw claim URL as a fallback. Delivery status is returned to the admin UI; failed/stubbed delivery keeps the invite usable and exposes the one-time clipboard fallback. Claim requires an authenticated account with the same email (case-insensitive), consumes the invite and creates the tutor profile transactionally, and permits only student/tutor roles—admin cannot be silently demoted. Email/password and Google accounts share this claim path; OAuth preserves the `/invite?token=...` return URL.

## Agent Herd (lead + skill-gated workers)

Parallel development uses a lead-agent + worker-herd setup on top of Herdr (see `docs/RUNBOOK.md` → **Agent Herd** for the operational runbook).

- **Lead agent** (`~/.config/opencode/agents/lead.md`, mode: primary) plans work, proposes a per-goal worker roster for user approval, then spawns/monitors/verifies workers through the `herd` wrapper (`~/.local/bin/herd`) and `herdr`. The lead **never sleep-polls**: it blocks on `herdr agent wait <name> --timeout <ms>` and `gh pr checks <n> --watch`.
- **Worker agents** (`.opencode/agents/worker-*.md`, mode: primary, git-tracked) are started in Herdr panes via `herd-spawn-worker` (`~/.local/bin/herd-spawn-worker`), which passes `--agent <worker-role>` to the spawned opencode process.
- **Skill isolation:** each worker's `permission.skill` block denies all skills except its one role skill, so worker contexts never load unrelated skill bodies. Workers still see `AGENTS.md` and the `.opencode/skills/AGENTS.md` workflow routing.
- **Worker roster:** `worker-frontend` → frontend-design · `worker-review` → code-review (edit: deny) · `worker-feature` → feature-workflow · `worker-core` → engineering-core · `worker-prod` → production-reliability. Each carries anti-loop rules (never re-run a command that already produced output).
- **Work isolation:** each write-capable worker operates in its own git worktree + branch under `~/cogito/wt-*` (or `<repo>/.worktrees/<branch>`), per the `parallel-worktrees` skill; workers never share a working directory. Before integration the lead diffs worker file sets against each other and reconciles overlaps.
- **Integration:** worker branches are never merged directly into main. The lead rebuilds the wave as a clean feature branch from `origin/main` with Conventional Commits, opens a PR, waits for CI (`gh pr checks --watch`), then squash-merges. Findings/concerns go into `docs/plans/active/` in the same PR (planning-first, AGENTS.md rule 11).
- **Escalation rule:** the lead must route every worker `blocked` state to the user first; it never resolves approvals autonomously. Passwords/secrets are typed by the user via `herd attach` directly in the worker pane.

## Architecture

Monorepo (Turborepo + Bun workspaces). PostgreSQL 16 (Docker port 6767). Drizzle ORM. Elysia server. oRPC (not tRPC). Better Auth 1.6.11. React 19 + TanStack Router/Query/Form. Selia UI (TailwindCSS v4 + @base-ui/react).

**4-layer architecture (after consolidation):** Router → Handler → Service → Repository

```
cogito-app/
├── apps/
│   ├── server/              # Elysia HTTP server (port 3001)
│   │   └── src/
│   │       ├── index.ts     # Bootstrap: init logger → create server → listen
│   │       ├── routes.ts    # Mount: evlog + cors + /api/auth + /rpc + protected content proxy + /health
│   │       └── middleware.ts # identifyUser (evlog/better-auth)
│   └── web/                 # Vite + React 19 + TanStack Router
├── packages/
│   ├── api/                 # Business logic (4-layer modules)
│   │   └── src/
│   │       ├── procedures.ts # publicProcedure, protectedProcedure, adminProcedure (tutorProcedure after foundation hardening)
│   │       ├── routers.ts    # appRouter composition
│   │       ├── services.ts   # Composition root: createModule() calls (~60 lines)
│   │       ├── context.ts    # Per-request: { session, services }
│   │       ├── lib/          # errors, db, tx (DbOrTx type), idempotency, circuit-breaker, rate-limit
│   │       ├── shared/
│   │       │   └── constants.ts  # NO shared/ports/ — ports are inline in consumer services
│   │       └── modules/      # Domain modules (4-layer each)
│   ├── auth/                # Better Auth config (pure, no wallet coupling)
│   ├── config/              # Shared TS config
│   ├── db/                  # Drizzle schema + migrations (postgres.js driver)
│   ├── env/                 # Zod-validated env vars
│   └── ui/                  # Selia component library (22+ components)
├── docs/                    # PRD, plans, context
└── designs/                 # .pen design files
```

### Server layout (2026-09-04, REFACTOR-PR)

`apps/server/src/routes.ts` was split into a plugin-per-area layout under
`apps/server/src/routes/`:

- `create-server.ts` — composition root: builds the Elysia app, mounts the
  route plugins, wires the logger and error handling.
- `middlewares.ts` — `identifyUser` (evlog/better-auth) and shared request
  middleware.
- `rate-limits.ts` — RPC + auth rate-limit path matching
  (`matchRateLimitPath`/`matchAuthPath`).
- `auth-routes.ts` — Better Auth `/api/auth/*` mounting.
- `rpc-routes.ts` — oRPC `/rpc/*` mounting.
- `upload-routes.ts` — `/uploads/*` local serving + presigned upload.
- `content-routes.ts` — protected Sanity content proxy.
- `openapi-routes.ts` — OpenAPI spec (auth-gated outside production).
- `health-metrics.ts` — `/health` + metrics.
- `webhooks/` — payment webhook routes (`payments.ts` + provider tests).
- `seed/` — guarded production seed scripts.

Typed webhook errors live in
`packages/api/src/modules/payment/payment.errors.ts`:
`WebhookSignatureError` (bad signature → 401), `WebhookTimestampError`
(stale timestamp → 408), `UnknownPaymentStatusError` (unmapped provider
status → 400). The webhook route classifies them as permanent (4xx, no
provider retry) vs transient (5xx, claim released).

## 4-Layer Architecture

**Router → Handler → Service → Repository**

| Layer      | Responsibility                                         | DB? | File                  |
| ---------- | ------------------------------------------------------ | --- | --------------------- |
| Router     | oRPC route definition, zod validation, auth middleware | No  | `{module}.router.ts`  |
| Handler    | DI factory + `{ context, input }` transport adapters   | No  | `{module}.handler.ts` |
| Service    | Pure business logic + consumer port interfaces         | No  | `{module}.service.ts` |
| Repository | Data access (SQL queries only)                         | Yes | `{module}.repo.ts`    |

Each module also has:

- `{module}.types.ts` — Zod input/output schemas
- `index.ts` — `createModule()` factory function

**No `shared/ports/` directory.** Cross-module dependencies use consumer-driven port interfaces defined inline in the consuming service. Types (`HoldParams`, `WalletSnapshot`, etc.) are defined in the provider's service file and imported by consumers.

### Consumer-Driven Port Pattern

Each consuming module declares only the methods it needs from another module:

```ts
// booking.service.ts — declares what booking needs from wallet
interface BookingWalletPort {
  hold(db: DbOrTx, params: HoldParams): Promise<WalletSnapshot>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  credit(db: DbOrTx, params: CreditParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  getOrCreate(userId: string): Promise<WalletSnapshot>;
}
```

TypeScript verifies structural compatibility at the `services.ts` wiring site when `wallet.service` is passed as `BookingWalletPort`.

### Handler Pattern

Each handler is a DI factory that creates `{ context, input }` adapters:

```ts
// wallet.handler.ts
export function createWalletHandler(wallet: WalletService) {
  return {
    get: async ({ context }: { context: Context }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return { id: w.id, totalBalance: w.totalBalance, ... };
    },
    hold: async ({ context, input }: { context: Context; input: HoldInput }) => {
      return wallet.hold(context.session!.user.id, input);
    },
  };
}
export type WalletHandler = ReturnType<typeof createWalletHandler>;
```

### Request Flow

```
POST /rpc/booking.create
  → Router: protectedProcedure.input(createBookingSchema).handler(bookingHandler.create)
  → Handler: extract userId from context, delegate to bookingService.createSolo(userId, input)
  → Service: validate, calculate price, call wallet.hold (via BookingWalletPort), create booking
  → Repo: INSERT INTO booking, INSERT INTO booking_participant
```

### ServiceRegistry

```ts
export interface ServiceRegistry {
  auth: AuthHandler; // Handler type for modules with HTTP endpoints
  admin: AdminHandler;
  wallet: WalletHandler; // Handler type (was WalletPort before)
  booking: BookingHandler; // Handler type (was BookingService before)
  contact: ContactService; // Service type for consent-based contact exchange
  pricing: PricingService; // Service type (no HTTP endpoints)
  audit: AuditService; // Service type (no HTTP endpoints)
  // ...
}
```

Routers access handlers via `context.services.{module}.{method}`. Other modules access services via DI through their consumer-driven ports.

## Domain & Policy References

### Booking creation UX

- The student booking form does not ask users to choose solo versus group up
  front. `Invite students (optional)` is always available; zero invitees uses
  the solo/solo-series RPC, while one or more invitees automatically uses the
  group/group-series RPC and updates participant count and pricing.
- Removing the final invitee automatically returns the request to solo without
  clearing the selected schedule or Session Notes.

- New tutor profiles store IDR base honoraria. Tutor discovery and booking
  creation derive the current Marks price from the active economy config, while
  every new booking stores an immutable economy version and IDR/Marks snapshot.
  Admin Cogito take changes affect future booking snapshots only and send one
  durable in-app system notification to every current tutor; identical saves
  are no-ops.
  Existing profiles/bookings that still use the legacy Marks map remain readable
  during migration.

- [`marks-economy-architecture.md`](marks-economy-architecture.md) — canonical reference for the closed-loop Marks economy, package pricing, tutor honorarium/take-rate formulas, regulatory assumptions, Knowledge Bank gating, and related engineering changes.
- The Marks blueprint is a reference architecture, not a substitute for Indonesian legal, regulatory, accounting, or payment-provider review before production launch.

## Infrastructure

- **Database:** PostgreSQL 16 via `postgres.js` (consolidated — driver migration complete)
- **Redis:** Shared instance for sessions, idempotency, rate limiting, circuit breaker state, BullMQ persistence (after production readiness)
- **Scheduler:** BullMQ with Redis persistence for booking expiry, hold release, email dispatch
- **Email:** Resend (production) / stub (development) via EmailService
- **Meeting/Calendar:** Online bookings use Google Meet (production) / manual link fallback via CircuitBreaker. When an offline booking receives a room and becomes `scheduled`, the provider creates a normal Google Calendar event without conference data or a Meet URL. Offline events carry the assigned room name/location and the same attendees, title, description, schedule, and booking deep link as online events. Assignment/relocation sync runs best-effort after the room transaction commits; repeat syncs reuse the live provider row. Accepted online reschedules update the event in place with attendee updates enabled and conference-data support retained, so guest calendars receive the new slot without losing the Meet conference. Reschedules update the event, and terminal booking paths delete it through the shared lifecycle hooks. Booking creation selects one active tutor competition specialization and snapshots its category/specialization metadata in `booking.session_topic`. Calendar titles use `Cogito - {Competition} | {Tutor} x {Student}` for solo bookings and append `& Friends` for groups; MUN/WSC use their standard abbreviations. Descriptions list tutor/students, `Session Topic: {category} - {specialization}`, Session Notes (including reference links), and `/bookings/{bookingId}`. `learning_goal` remains the Session Notes compatibility carrier; file uploads are deferred. OAuth refresh-token and service-account setup is documented in [`docs/GOOGLE-MEET-SETUP.md`](GOOGLE-MEET-SETUP.md).
- **Deployment:** Coolify on the OVH VPS; production API and web images are pulled from GHCR
- **Database TLS:** Controlled by `DB_SSL_ENABLED`; Coolify's bundled PostgreSQL is non-TLS, while external managed databases may require it

## DB Schema (31 tables)

### `user` (auth.ts) — CHECK(role IN ('student','tutor','admin'))

### `session` / `account` / `verification` (auth.ts) — Better Auth owned

### `wallet` (wallet.ts) — CHECK(total=held+available), uuid PK

### `ledgerEntry` (wallet.ts) — UNIQUE(wallet_id,event_key,source_reference), CHECK entry types

### `studentProfile` (student-profile.ts) — uuid PK

`allow_contact_requests` defaults to true and blocks only new contact requests
when set to false.

### `contactRequest` (contact-request.ts) — completed-session request state, explicit email consent, and booking/user foreign keys

### `tutorProfile` (tutor-profile.ts) — CHECK modality + onboarding_status + profile_edit_status; keeps approved public values separate from pending reviewed edits; stores IDR base honoraria in `base_rates_idr` and one-time Tutor Terms of Service acceptance metadata (`terms_of_service_accepted_at`, `terms_of_service_version`)

### `economyConfig` (economy-config.ts) — singleton active Marks value, IDR tutor honorarium parameters, and admin-managed Cogito take schedule

### `notification` (notification.ts) — durable in-app notifications; economy schedule changes use a per-version/per-tutor event key and the `system` category

### `availabilitySlot` (availability-slot.ts) — tutor availability windows (one-time + weekly-generated)

### `tutorInvite` (tutor-invite.ts) — CHECK status, revoked_by/at fields

### `achievement` (achievement.ts) — CHECK status; private `evidence_url`, optional admin-managed public `documentation_url`, `awarding_date`

### `auditLog` (audit-log.ts) — CHECK actor_type, before/after state jsonb

### `booking` (booking.ts) — immutable booking_number, status state machine, deadline_at, hold_amount

### `bookingParticipant` (booking.ts) — confirmation_state, attendance

### `bookingSession` (booking.ts) — series child sessions with independent state

### `bookingStateHistory` (booking.ts) — state transition audit trail

### `bookingRescheduleProposal` (booking.ts) — tutor-proposed reschedule; status pending/accepted/rejected/expired

### `sessionNote` (booking.ts) — notes on completed sessions (author_id + booking_id)

### `room` (booking.ts) — offline rooms, is_active flag

### `roomBooking` (booking.ts) — room assignment with status requested/confirmed/relocated/cancelled

### `meetingEvent` (booking.ts) — provider event/link state (google_meet/manual), status + error_reason. `google_meet` identifies the shared Google Calendar provider row; offline rows intentionally have no `meetingUrl`. Calendar title/description/location metadata is provider-side and is not a new database field.

### `paymentRecord` (payment-record.ts) — payment status tracking

### `refundRecord` (payment-record.ts) — refund/correction tracking, UNIQUE(provider_event_id)

### `markPackage` (mark-package.ts) — purchasable mark packages; application-generated UUID text ids, stable `code`, and active/inactive catalog state. Default rows are installed by the idempotent data migration `0041_seed_mark_packages.sql`.

### `notification` (notification.ts) — in-app notification records

### `notificationDispatch` (notification.ts) — email dispatch tracking

### `supportTicket` (support-ticket.ts) — lateness/no-show + issue reports; status + sla_deadline

## API Modules (20 routers + internal modules)

All procedures are POST (oRPC convention). Auth via session cookies.

### Auth Module (protected)

- `me`, `getProfile`, `updateProfile`, `searchStudents`
- `searchStudents` accepts a name/email lookup but returns only `id`, `name`, and `image`.

### Admin Module (admin)

- `listUsers`, `searchUsers`, `setRole`, `getWallet`, `listLedgerEntries`, `getTutorPayouts`, `getPendingTutorPayouts`, `markTutorPayoutPaid`, `getEconomySettings`, `updateEconomySettings`

### AdminMarkPackage Module (admin)

- `list`, `create`, `update`, `setActive`
- Owns the transactional admin catalog API for mark packages. Package codes are immutable business keys used by payment creation; deactivation is a soft state change, not a delete.

### AdminTutor Module (admin)

- `createInvite`, `listInvites`, `resendInvite`, `revokeInvite`
- `listTutorProfiles`, `reviewTutorProfile`, `updateTutorAchievements`

### Tutor Module (tutor)

The tutor `/profile` editor presents education, competition achievements, and experiences in one combined **Achievements & experience** card with a single public preview; each subsection keeps its own private proof-link field. Short bios are limited to 50 words, and the proof-link guidance recommends one Google Drive folder shared with “Anyone with the link can view” for both achievement and experience evidence.

- `getMyProfile`, `updateMyProfile`, `submitForReview`
- The first complete `submitForReview` requires the bilingual Terms of Service checkbox; the server records the acceptance timestamp/version once and later `changes_requested` resubmissions proceed without a second prompt.
- Tutor profiles store structured `education` (maximum 2 entries), one structured achievement section backed by `competitionAchievements` (maximum 5 entries, each with comma-separated award titles), and one structured experience section backed by `experienceEntries` (maximum 5 role/organization/year/description entries); the web editor previews the normalized format and the public discovery drawer renders it without year grouping dots. The award editor keeps an in-progress comma visible while the next title is being typed, and experience text fields preserve punctuation.
- The tutor profile editor separates **Save draft**/**Save profile changes** from **Submit for review**. Draft saving does not require the complete onboarding set, while malformed values are shown with field-level errors, a validation summary, and focus on the first invalid control; submission applies the complete required-field gate. Published tutors remain editable while profile changes are under review: saving updates the pending proposal, and submitting validates and queues the latest version.
- The admin tutor index derives its displayed status from both onboarding and edit-review state: a published tutor with submitted pending changes is labeled **Edit review**, while an edit returned by admin is labeled **Revision requested**, so admins can identify work requiring attention without opening the drawer.
- The tutor profile photo uploader is the first editable section and uses the same compact clickable-avatar crop flow as the student identity editor. Published tutors see the current public photo beside their proposed replacement; the replacement remains staged in `pendingProfileChanges.profileImageUrl` until admin approval. Full photo previews stay behind the compact Selia `InfoPreview` popover, while the admin review drawer shows the current and proposed assets side by side rather than presenting the pending asset as already public.
- `subjectIds` uses the normalized competition category/specialization taxonomy; tutors may select at most 7 active specializations. Drafts may save without specializations, but review submission requires at least one active current specialization. Archived legacy specializations remain readable but cannot be newly selected. The product term is **specialization**; compatibility API/database names such as `subjectIds`, `subjects`, and `listSubjects` remain unchanged.
- `listAvailability`, `upsertAvailability`, `createWeeklyAvailability`, `deleteAvailability`
- `getMyPayouts`

### TutorDiscovery Module (protected)

- `listSubjects` (public — the seven active competition categories with 33 selectable specializations)
- `listPublished`, `getProfile` (student-only; supports single or multi-value `categoryId`/`subjectId` filters via normalized specialization joins; a missing match returns an empty list)
- Shared Selia controls keep category/specialization IDs and modality values for query inputs while rendering labels; tutor onboarding shows all competition categories with checkboxes, while the tutor list allows multiple categories and specializations, with empty arrays meaning “All”. Tutor discovery keeps search visible and places category, specialization, and modality controls in a collapsed-by-default filter panel; its trigger retains an active-selection count when the panel is closed. The panel expands with a short height/fade transition, rotates its chevron, remains outside keyboard navigation while closed, and disables motion when reduced motion is requested. Multi-select values truncate only the leading label while keeping the `+N more` chip and its ring visible. Search and filter changes debounce `listPublished` by 300 ms so rapid typing or multi-select toggles coalesce into one request.
- On mobile, tutor discovery cards use a compact profile composition: a 56-pixel avatar and identity header, two-line bio, short specialization badges, and a separated price footer with the shared Marks prefix plus a chevron. Desktop retains the denser horizontal summary, uses natural-width child specialization labels without a repeated parent category, keeps its metadata on one line, and progressively reveals additional specialization badges at wider breakpoints while preserving the `From [Marks icon] #` price label. The whole card remains the profile trigger with a smooth hover-shadow treatment and no translate or pressed-scale effect.
- The student-facing tutor drawer renders available pricing maps as one group-size matrix with separate Online and Offline Marks columns, prefixing populated price cells with the Cogito Marks icon. This is presentation-only; the discovery response and pricing contracts remain unchanged.
- The student-facing tutor drawer opens as a swipe-down bottom sheet below the `sm` breakpoint and as a right-side drawer at `sm` and above. It keeps its 300px image hero and booking footer outside the profile body's single vertical scroll container; the body may overscroll locally without moving those fixed regions, so long structured profiles remain reachable on short viewports. Education, achievements, and experiences share one combined profile-highlights panel with legacy text fallbacks. This is presentation-only; the discovery response and pricing contracts remain unchanged.

### Invite Module (public + protected)

- `verify` (public), `claim` (protected)

### Achievement Module (protected + admin + public)

- `list`, `create`, `update`, `delete`
- `adminList`, `adminUpdate`, `adminReview`
- `listApproved` (public — consumed by the public `cogito-acad` achievement archive and homepage preview)
- The student `/achievements` list and admin `/admin-achievements` moderation queue use compact, horizontally scrollable Selia tables with minimum column widths; each row opens a shared detail drawer for category, level, description, location, attachments, notes, and available edit/delete or correct/approve/reject actions. The drawer presents metadata as consistent labeled values while retaining a semantic status badge, opens as a swipe-down bottom sheet below the `sm` breakpoint, and becomes a right-side drawer at `sm` and above. Evidence and public-documentation attachments open in a lightweight image preview with an original-file fallback. The student summary counts use the same compact label-and-pill cards as the admin moderation counts. The table containers are full-bleed within their card bodies, while the page/card wrappers stay constrained to the viewport so only the table content scrolls horizontally. This is presentation-only and does not change the achievement RPC or persistence contract.
- The public projection is an allowlist: it includes approved + visible records and the owner's display name, but never `userId` or private `evidenceUrl`. Optional activity documentation remains public-safe.
- Student achievement levels are presented in this order: `International`, `National`, `Province/State`, `City/Regency`, `School`. The student proof field gives Google Drive guidance (upload proof, set General access to “Anyone with the link” + Viewer, then paste the link); students do not provide the public documentation image.
- The student form uses one clear Location value (for example `Jakarta, Indonesia`, `Geneva, Switzerland`, or `Online`) and a long-answer `Brief Description` field with a ranked-result example. The public documentation image is an admin-only correction field.
- `adminUpdate` lets admins correct all submission fields plus the public documentation image while a record is `pending`/`pending_review`; it uses the row version as a compare-and-swap, writes an `achievement_admin_updated` audit record, and leaves status unchanged until the separate review action.
- The achievement form uses the shared Selia calendar; selected/today states are drawn on the rounded day button rather than its square grid cell. Its portal-based date picker and Category/Level selects render above the achievement dialog so students can interact with every popup control.

### Wallet Module (protected)

- `get`, `listLedger`, `listPackages`, `knowledgeBankEligible`
- (`hold`/`release`/`deduct`/`credit`/`compensate` are service-layer only — not exposed over RPC)

### Pricing Module (internal)

- `computeSplit` (legacy Marks pricing), `computeEconomics` (IDR honorarium + Cogito take), `validateBaseRates`, `getEconomyConfig`

### Booking Module (student mutations + shared authenticated reads)

Tutor availability is modeled as free-time windows rather than pre-sized sessions. The booking UI uses the shared Selia calendar/date picker and a cross-browser 24-hour autocomplete time field; students can enter any exact minute, but a start must leave room for the server-fixed 90-minute session inside the selected window. A one-session selection is one-time and multiple selections form a series automatically.

- `createSolo`, `get`, `listMine`, `cancel`
- `proposeReschedule` (booking proposer), `acceptReschedule`, `rejectReschedule`, `cancelSession`, `getRescheduleAvailability`
- `addSessionNote`, `getSessionNotes`
- `createGroup`, `createSeries`, `createGroupSeries`, `confirmInvite`, `declineInvite`, `withdrawInvite`, `reconfirm`, `withdraw`
- `listSessions`

Tutor discovery and every student-owned booking mutation are guarded by `studentProcedure`. The protected booking list/detail/session reads are shared by authenticated parties: students see proposer/participant bookings, tutors see assigned bookings, and admins see all bookings. Tutor/admin accounts still cannot browse the student tutor catalog or create/cancel/confirm/reconfirm/withdraw bookings; tutor fulfillment remains under `tutorActions.*`.

Booking read relations expose only safe user identity (`id`, `name`, `image`,
`role`). Internal meeting attendee email arrays are selected only by
server-side meeting/notification code.

After submission, the tutor or booking proposer can propose a replacement time from the booking-detail action panel. The proposal form opens in a height-constrained bottom Selia drawer on mobile and a right-side drawer on desktop, with a scrolling body and persistent action footer. The frontend dispatches student proposals to `booking.proposeReschedule` and tutor proposals to `tutorActions.proposeReschedule`; both routes use the shared service. Rescheduling is session-scoped; each proposal requires tutor and all active-student approval, and the original schedule remains active until unanimous acceptance.

### TutorActions Module (tutor)

- `listBookings`, `proposeReschedule`, `acceptBooking`, `declineBooking`, `setMeetingLink`, `completeSession`, `markAttendance`, `markParticipantNoShow`

### Contact Module (student)

- `listForBooking`, `request`, `respond`
- Available only to eligible students who shared a completed group booking.
  Requests are in-app only; the recipient chooses whether to share email, and
  the requester is the only viewer who receives a shared email value.

### Payment Module (protected + public webhook)

- `createPurchase`, `getPurchase` (protected)
- `POST /webhooks/payments/:provider` (public — signature + IP allowlist + timestamp validation)

### Room Module (protected + admin)

- `list`, `checkAvailability` (protected)
- `create`, `assign`, `relocate`, `cancelBooking` (admin)

### Notification Module (protected)

- `list`, `getUnreadCount`, `markAsRead`, `updateReadStatus`, `markAllAsRead`

### AdminBooking Module (admin)

- `applyOverride`, `previewOverride`, `listBookings`, `getBookingStateHistory`, `adminRefund`
- `setMeetingLink` (admin manual meeting-link entry for online `CONFIRMED`/`SCHEDULED` bookings), `cancelSeriesSession` (admin per-session series cancel with Marks-return choice)

### Refund Module (admin)

- `createCorrection`, `listCorrections`

### Support Module (protected + admin)

- `createTicket`, `listTickets` (protected)
- `adminListTickets`, `adminResolveTicket` (admin)

### Upload Module (protected)

- `createUploadUrl` — validates content-type allowlist, filename, and 1-byte–5 MB content length, then returns a presigned PUT upload for Cloudflare R2 or an authenticated local `/uploads/*` raw-body POST URL (dev); `GET /uploads/*` serves local files when `R2_PUBLIC_URL` is unset. R2 signs the content type and exact declared length, and browser uploads require bucket CORS. The student profile photo picker crops the selected image to a square in the browser before uploading.

### Scheduler Module (internal)

- BullMQ repeatable jobs: `expire-bookings` (5m), `release-expired-holds` (10m), `check-tutor-lateness` (5m), `send-notification-email` (60s — consumes the email outbox via `dispatchQueuedEmails`; failed rows are retried up to 3 attempts), `escalate-support-tickets` (15m), `retry-failed-meetings` (5m — re-creates Google Meet for CONFIRMED online bookings whose meeting creation failed, up to 3 attempts)

Internal-only modules with no RPC procedures: `audit`, `economy`, `email`, `meeting`, `pricing`, `scheduler`.

## Auth Config

- Email/password enabled. Google OAuth optional (conditional on env vars, after foundation hardening); the configured Google provider sends `prompt=consent` so the Google permission screen is shown during verification runs even for a previously authorized account.
- Production/staging admin bootstrap uses `ADMIN_EMAILS` (default `itcogitoacademy01@gmail.com`) to promote matching existing or newly-created accounts case-insensitively; existing admins are preserved and the normal admin role-management flow remains available for other addresses.
- Password reset flow: Better Auth built-in endpoints (`/api/auth/request-password-reset`, `/api/auth/reset-password`). Email via existing EmailService (category `auth`), wired through `setAuthEmailSender()` from the composition root (`apps/server/src/index.ts`). Unknown emails get the same success response (no enumeration). `revokeSessionsOnPasswordReset: true` — all existing sessions die on reset. Reset token valid 1 hour.
- Wallet created lazily via `WalletService.getOrCreate()` on first `auth.me` call.
- Cookies: session cookies use sameSite=strict (production) / lax (development), secure=true (production), httpOnly=true. The short-lived Better Auth OAuth state cookie is explicitly sameSite=lax so the signed state returns on the provider's top-level callback GET; it remains secure/httpOnly and is checked against the database verification record. Same-site subdomain requests work because `app.cogitoacademy.id` and `api.cogitoacademy.id` share the `cogitoacademy.id` site. Google login uses `prompt=consent` to make the provider permission screen visible for verification evidence; it requests identity scopes only and does not add the server-side Meet/Calendar scope to every user's login.
- `CogitoUser` type exported with role field.
- Web email sign-in and sign-up treat authentication as one awaited handoff: Better Auth must return success, the client reads a fresh session with `disableCookieCache`, and then TanStack Router navigates by a validated return path or the role/onboarding default. Tutor accounts without a profile, or with `draft`/`changes_requested` onboarding status, go to `/profile`; tutors in review, approved, published, or suspended states and admins go to `/dashboard`, as do students by default. The client suppresses Better Auth's overlapping session signal refresh during that handoff so the form does not remount into the global pending loader; the authenticated shell uses the same fresh session source for its parent route guard. A user whose fresh session has `emailVerified !== true` is sent to `/verify-email` after a new OTP request, including legacy accounts created before verification was introduced; the selected post-login destination is preserved for after verification. Existing users are not backfilled as verified. This is frontend-only and does not change auth endpoints or persistence.
- The `/login` email forms validate each touched field on change and blur, keep the client rules aligned with the server password policy, show inline Selia field errors and danger outlines for touched or blocked fields, and normalize name/email whitespace before calling Better Auth. This is presentation and client-validation behavior only; it does not change auth endpoints or persistence.
- **Pending (foundation hardening):** password policy — **fully implemented (C6 closed by REVIEW-FIXES-3 P6)** — min 8 via `minPasswordLength` + upper/lower/digit via `assertPasswordPolicy` enforced in the server auth route at sign-up (`apps/server/src/routes.ts`), mirrored in the sign-up form (single consistent statement — 2026-08-17). Conditional Google OAuth — implemented (gated on env vars). Session expiry is set (7 days, `expiresIn`); the authenticated web shell warns during the final 30 minutes and keeps the existing unauthorized redirect as the fallback. **Email verification (G2) — implemented (REVIEW-FIXES-4 P4.4, #76), enforcement level: sign-up/sign-in routing plus paid actions** — better-auth `emailOTP` plugin (6-digit OTP, 5 min expiry, `sendVerificationOnSignUp`), OTP delivered via the shared email port (`setVerificationEmailSender` + `buildVerificationEmail`); the automatic email/password signup OTP uses the same message as the P2 welcome/onboarding copy, so it creates one provider delivery instead of separate welcome and verification emails. `/verify-email` UI route collects the code; `auth.api.verifyEmailOTP` marks the user verified. New and legacy users with `emailVerified !== true` are sent to `/verify-email` after email/password or Google sign-in, with a new OTP request and a validated return path; existing users are not backfilled as verified. **Enforcement (backend finalization):** the four booking-create procedures (`booking.createSolo/createGroup/createSeries/createGroupSeries`) and `payment.createPurchase` run on `verifiedStudentProcedure` (`procedures.ts`), which throws `FORBIDDEN` ("Email verification required") unless the session user is a student with `emailVerified === true` — an unverified user cannot create bookings or purchase Marks.

## CI/CD

- **CI test and coverage performance (2026-09-02):** `.github/workflows/ci.yml` restores the shared Bun install cache before `bun install`, and typecheck/build restore separate Turbo caches. Pull requests use full git history plus Turbo `--affected` for typecheck and build; manual dispatches still run the full graph. The web `check-types` task only runs `tsgo --noEmit`, leaving the production Vite build to the Build job. Test + Coverage starts independently of lint/typecheck, runs one lcov-producing coverage suite, then the server suite in a separate process because its webhook test uses `mock.module`; the previous duplicate uninstrumented API pass is removed. A failed coverage test command is explicitly propagated after the coverage comment/gate step.
- **GitHub Actions** (`.github/workflows/ci.yml`): 5 jobs (lint, typecheck, build, test+coverage, and the isolated E2E Browser Workflow). The lint job auto-applies `oxlint --fix` + `oxfmt --write` and commits the fixes back to the PR branch before verifying, so formatting nits don't require a manual push cycle. Tests run `packages/api/src/tests/`, the env/auth/db package tests, and `apps/server/src/openapi.test.ts` in the coverage process; the remaining `apps/server/src/` tests stay in a **separate process** because the webhook idempotency TTL test uses `mock.module` for `@cogito-app/api`. The E2E package participates in the root typecheck gate and the E2E job provisions PostgreSQL 16 and Redis 7, writes an isolated `.env.test`, migrates, installs Chromium, runs the full seeded workflow, and uploads the Playwright HTML report plus failure screenshots/traces on failure or success. Test hooks have a 30-second budget to absorb slow CI database setup while still catching hangs. Coverage gate: `packages/api` lines, overall lines, overall functions, and overall branches must each be 100% (enforced by `.github/scripts/coverage-comment.ts`; a 0/0 branch total is treated as 100%).
- **CD**: The production workflow and `scripts/migrate-and-deploy.sh` are restored to their last known successful state at `bb1ccb9a` after a VPS-side immutable-image pull exhausted disk and crashed the self-hosted runner. GitHub Actions builds and pushes server/web images on a hosted runner; the VPS job resolves the private database, runs pg_dump → private R2 snapshot → `bun run db:migrate`, posts the configured Coolify webhook, and verifies `/health.version`. The VPS deploy job does not pull application images directly.
- **Lefthook** pre-commit: oxlint + oxfmt. Pre-push: typecheck.
- **Labeler** (`.github/workflows/labeler.yml`): labels PRs `server`/`web`/`infrastructure`/`docs` by changed paths (`.github/labeler.yml`); needs `pull-requests: write` permission.
- **Dependabot**: weekly npm + GitHub Actions updates.
- **Coverage**: 100% for `packages/api` lines, overall lines, overall functions, and overall branches; package-level env/auth/db tests are included in the coverage command
- **Health**: `GET /health` returns `{ status, checks: { database, redis, scheduler, dlq }, dlqDepth, timestamp, version }` — DB `SELECT 1`, Redis `ping()`, and scheduler readiness (`checkSchedulerHealth`) are checked; `checks.scheduler` is `error` whenever Redis is unreachable (the scheduler cannot run), `degraded` when no Redis client exists. `checks.dlq`/`dlqDepth` are alert-only and never flip the overall status. `dlqDepth` is age-aware (2026-08-31): it counts only DLQ ledger entries whose push-time `failedAt` is within the freshness window (`DLQ_FRESH_WINDOW_MS` = 24h default; `DLQ_FRESH_WINDOW_HOURS` env override; invalid values fall back to 24h), computed in Lua; entries without `failedAt` (the pre-2026-08-31 ledger) count as stale and never trip the alert — the full ledger stays in Redis. `version` is the deployed image sha (`process.env.GIT_SHA`, injected by the Dockerfile; `"dev"` when unset) so the CD pipeline can verify the deployed container
- **Deployment platform**: Coolify for the API (self-hosted PaaS on the VPS) and Cloudflare Pages for the frontend
- **Scheduler boot**: The BullMQ worker + 6 repeatable jobs (`expire-bookings` 5m, `release-expired-holds` 10m, `check-tutor-lateness` 5m, `send-notification-email` 60s, `escalate-support-tickets` 15m, `retry-failed-meetings` 5m — wired in `apps/server/src/scheduler.ts`) only start when the server runs with `SCHEDULER_ENABLED=true` **and** `REDIS_URL` set (via `initScheduler()`, wired in server bootstrap). Without both, the scheduler logs `scheduler_skip` and the booking-expiry/hold-release/email/SLA jobs never run. **Fail-loud boot:** when `SCHEDULER_ENABLED=true` but Redis is unreachable, `initScheduler()` pings the shared Redis (`checkSchedulerHealth`) and **throws — the boot aborts** instead of silently running without the expiry/hold-release/email jobs. `send-notification-email` consumes the email outbox (`notification.dispatchQueuedEmails`): notification writes queue dispatch rows (`status='queued'`) inside the DB transaction and the scheduler sends them, so no email I/O happens inside open transactions. `GET /health` surfaces a `checks.scheduler` entry (`ok`/`error`/`degraded` from the same Redis ping), so a dead scheduler trips the readiness check.
  1d8dd3b (feat(infra): add OVH Terraform and Coolify bootstrap)

## Plans

Plans live in `docs/plans/` (active + completed) and `docs/archive/` (superseded/historical). See `docs/plans/README.md` for the index.

> **`.superpowers/sdd/` disposition (2026-08-17):** kept as the execution ledger — worktree paths, commit ranges, test counts, and merge reconciliation live in `.superpowers/sdd/{PLAN}/progress.md`; the durable plans stay in `docs/plans/`. The two-file-per-plan rule applies: plan in `docs/plans/`, ledger in `.superpowers/sdd/{PLAN}/progress.md`. The `.superpowers/sdd/.gitignore` tracks `**/progress.md` plus the archived `BACKEND-HARDENING/` + `BACKEND-HARDENING-PHASE2/` histories (formerly untracked local files, now committed).

| Plan                                                              | Branch                                                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/completed/WEBSITE-AUDIT-P1-HARDENING.md`              | working tree                                                                        | **Completed (2026-08-29)** — cross-booking no-show ownership guard, locked/stale-safe reschedule decisions, database-backed room overlap prevention, and sidebar type-gate repair                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/plans/completed/WEBSITE-AUDIT-P2-HARDENING.md`              | `f/website-audit-hardening`                                                         | **Completed (2026-08-29)** — HTTP(S)-only external links, final-attempt DLQ routing, and optimistic concurrency for achievement/tutor moderation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/plans/completed/WEBSITE-AUDIT-P3-PAYMENT-WEBHOOK.md`        | `f/website-audit-hardening`                                                         | **Completed (2026-08-29)** — lifecycle-aware Xendit webhook idempotency without cross-status or missing-event-id collisions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/plans/completed/WEBSITE-AUDIT-P4-EDGE-CASES.md`             | `f/website-audit-hardening`                                                         | **Completed (2026-08-29)** — malformed signup JSON handling and half-open room availability checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/MIDTRANS-MIGRATION.md`                                      | `release/2026-09-03-log-midtrans-booking`                                           | **Implemented + merged (2026-09-04)** — Midtrans Snap provider behind the `PaymentProvider` port (env schema + services wiring + webhook route + tests + operator guide); Xendit kept as default/rollback; operator cutover pending per the guide                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/plans/completed/LOG-CONSOLIDATION-PAYMENT-UX.md`            | `release/2026-09-03-log-midtrans-booking`                                           | **Completed (merged #189, 2026-09-04)** — one consolidated `request_complete` log line per request (method/path/status/requestId/durationMs/userId; `rpc_error` correlated); purchase error toast + Test Mode labels; Midtrans migration + booking date fix landed in the same wave PR                                                                                                                                                                                                                                                                                                                                                                                                |
| `docs/plans/completed/REVIEW-FIXES-4.md`                          | main (merged)                                                                       | Completed (2026-08-18) — wave-4 audit fixes merged via #68–#70, #75–#76 (docs/sdd reconciliation, money bugs C1–M9, Xendit rewrite, fail-loud 3P guards, G2 email verification)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/plans/completed/WAVE-6-REVIEW-FIXES.md`                     | `fix/wave6-a` (PR #82), `fix/wave6-b` (PR #83), `fix/wave6-c` (PR #84) — all merged | **Completed (2026-08-19)** — all wave-6 findings (H1–H3, M1–M5, L1–L3, N1–N4, P1–P3) fixed & merged; L3 closed as defense-in-depth                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/plans/completed/PRD-GAPS-PHASE3.md`                         | main (merged)                                                                       | Active — all U-items closed (U9 closed by REVIEW-FIXES-4 P2.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/plans/active/FRONTEND-GAPS-SPEC.md`                         | `f/f9-session-notes` (follow-up); `f/competition-taxonomy` (PR pending)             | Active — F1 admin workspace, hydrated participant wallet/ledger detail, and OQ-04 SLA projection are complete; F9 session notes editor/rendering is complete; F18 proposer-side pending-invite withdrawal is complete; F12 room approval queue and active-room catalog are implemented; booking detail meeting/activity UX refined 2026-08-22 and compact contextual info previews added 2026-08-26; competition taxonomy follow-up implemented 2026-08-25; empty-state consistency follow-up documented 2026-08-25; tutor discovery pricing matrix consolidated 2026-08-27; booking overflow polish added 2026-08-28; canonical tutor profile-image workflow consolidated 2026-08-31 |
| `docs/plans/completed/TUTOR-TERMS-ONBOARDING.md`                  | working tree                                                                        | **Completed (2026-09-02)** — bilingual Tutor Terms of Service modal and server-enforced, first-submit-only consent persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/plans/completed/ECONOMY-RATE-CONTROL.md`                    | main                                                                                | Completed 2026-08-22 — admin-managed Cogito take schedule, IDR tutor honoraria, immutable booking snapshots, and all-role economy E2E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `docs/plans/active/DEFERRED-OPS-TASKS.md`                         | main (post-merge)                                                                   | Active — code gaps 1.1–1.8 done (1.4 now 0 bare selects); §2 Redis session caching deferred; §3/§4 ops pending (provisioning/CD secrets partially done via the deployment wave)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `docs/plans/active/DEPLOYMENT-PLAN.md`                            | main (merged #115–#118)                                                             | **APPLIED 2026-08-31** — Terraform 7 resources in state (no drift), Tailscale + hardening done, Coolify resources declared (47 env vars), backup cron installed, webhook route live (401 auth-required). Remaining: Uptime Kuma + Discord, drills, Xendit go-live                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/plans/active/DEPLOYMENT-WAVE-2.md`                          | main (merged #121–#122)                                                             | **APPLIED 2026-08-31** — Terraform imports + Ansible apply completed via `infra/apply.sh` (live-API fixes #136/#137); vault refreshed; deploy-webhook route live                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/plans/completed/DEPLOYMENT-DISPATCH.md`                     | main (merged #115–#118)                                                             | **Executed 2026-08-27** — PR A (#115), PR B (#116), W1 (#118), W2 (#117) all merged; retained as historical dispatch                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/BACKEND-PROD-FINALIZATION.md`               | `finalize/backend-prod-readiness-v2` (merged #106)                                  | **Completed (2026-08-26)** — PRD v1.7 alignment + production-readiness fixes (documented gaps 1–10 + audit findings F1–F25/S1–S14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/plans/completed/CONTACT-SHARING.md`                         | `f/contact-sharing-flow` (PR #108)                                                  | **Implementation complete (2026-08-27)** — consent-based post-session contact requests, explicit email sharing, and privacy leak regression coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/NOT-FOUND-AND-ERROR-UX.md`                  | main                                                                                | **Completed (2026-08-27)** — ErrorOne-style 404/500 states and plain-language network error copy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/plans/completed/PRD-AUDIT.md`                               | `finalize/backend-prod-readiness-v2` (merged #106)                                  | **Completed (2026-08-26)** — PRD + wiring audit gap list (Phase 0 deliverable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/plans/completed/REVIEW-FIXES-3.md`                          | main (merged)                                                                       | Merged to main (#59–#65) — all wave-3 PRs landed; G2 (email verification) was deferred and is now **implemented** by REVIEW-FIXES-4 P4.4 (#76)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/plans/completed/CONSOLIDATION-PLAN.md`                      | `improvement/consolidation`                                                         | Merged to main (#16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/CONSOLIDATION-PHASE2-ERROR-ARCHITECTURE.md` | `improvement/consolidation`                                                         | Merged to main (#16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/CONSOLIDATION-PHASE2.5-GAPS.md`             | `improvement/consolidation`                                                         | Merged to main (#16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/FOUNDATION-HARDENING.md`                    | `improvement/foundation-hardening`                                                  | Merged to main (#17)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`               | `improvement/production-readiness`                                                  | Merged to main (#18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/INFRASTRUCTURE-PLAN.md`                     | `improvement/infrastructure`                                                        | Merged to main (#19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/plans/completed/PRD-GAPS-SPEC.md`                           | main (merged)                                                                       | Merged to main (#36, #39–#43) — all G1–G20 landed; B-series fixes in #46                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/plans/completed/BACKEND-HARDENING.md`                       | main (merged)                                                                       | Merged to main (#34–#38)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/plans/completed/BACKEND-HARDENING-PHASE2.md`                | main (merged)                                                                       | Merged to main (#46) — all 6 PRs implemented (security, money correctness, outbox, uploads, PRD-correctness)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/plans/completed/BACKEND-REVIEW-HARDENING.md`                | `fix/backend-review-hardening`                                                      | Merged to main (#48) — review fixes (C1, H1–H7, M1–M16, L1–L9) + Redis mandatory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/plans/completed/REVIEW-FIXES-2.md`                          | main (merged)                                                                       | Merged to main (#50–#57) — wave-2 review fixes (rate limits, withdraw, uploads/payments, coverage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs/plans/completed/BACKEND-CLEANUP.md`                         | main (merged)                                                                       | Completed — all 11 items merged (2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/plans/completed/COVERAGE-100.md`                            | `f/booking-list-refactor` (PR #93)                                                  | Completed 2026-08-23 — 100% line coverage gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/plans/completed/ACHIEVEMENT-STUDENT-REVIEW-UX.md`           | `f/client-revisions`                                                                | **Completed locally (2026-09-02)** — clearer student achievement entry, admin-only public documentation, audited versioned correction flow, and table-based student/admin list UX                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/archive/EXECUTION-PLAN-v2.md`                               | —                                                                                   | Superseded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/archive/REFACTORING-PLAN.md`                                | —                                                                                   | Historical reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Execution Order

```
1. Consolidation (merged #16) → main
2. Foundation Hardening (merged #17) → main
3. Production Readiness + Infrastructure (merged #18 + #19) → main
4. Deferred Ops Tasks (code gaps 1.1–1.8) → merged to main; §2 Redis session caching deferred
5. PRD Gaps Backend (G1–G20) → merged to main (#35, #36, #39–#43)
6. Backend Hardening Phase 2 (BACKEND-HARDENING-PHASE2.md, PRs 1–6) → merged to main (#46)
7. Backend Review Hardening (BACKEND-REVIEW-HARDENING.md) → merged to main (#48)
8. Review Fixes 2 (REVIEW-FIXES-2.md) → merged to main (#50–#57)
9. Review Fixes 3 (REVIEW-FIXES-3.md — PRs #59–#65) → merged to main
10. Review Fixes 4 (REVIEW-FIXES-4.md — docs/sdd reconciliation, money bugs C1–M9, Xendit rewrite, fail-loud guards, G2 email verification) → **completed (merged via #68–#70, #75–#76)**
11. Frontend Gaps (FRONTEND-GAPS-SPEC — F1/F8/F9/F13/F14/F16/F18 closed; F2/F3/F6/F7/F11/F17 closed by merged #55; F12 room approval queue and active-room catalog implemented) → after / parallel with #10
12. Backend Finalization (BACKEND-PROD-FINALIZATION.md — PRD v1.7 alignment + audit findings F1–F25/S1–S14) → **merged #106 (2026-08-26)**
13. Post-Finalization Re-Audit (REAUDIT-FINDINGS.md — N1 reconfirm loop, N2 suspended restore, W1 env drift, env prod guards) → **merged #107 (2026-08-26)**
14. Deployment Wave (DEPLOYMENT-PLAN.md + DEPLOYMENT-DISPATCH.md — infra scaffold #115, DLQ health #116, nightly backups #117, CD pipeline #118) → **merged 2026-08-27; APPLIED 2026-08-31 (Terraform + Ansible via infra/apply.sh)**
15. Production Ops (DEFERRED-OPS-TASKS §2 Redis session caching, §3 manual verification, §4 production ops) → requires live env + Coolify
16. CI Performance (CI-SANITY F14 — cache restores, Turbo `--affected` for PR typecheck/build, web build moved to the Build job, single coverage suite) → **merged #165 (2026-09-02)**
17. Ops Visibility (OPS-VISIBILITY-WAVE — FAILURES.md, circuit breakers in `/health`, DLQ retention, ops.sh `cb`, pre-migrate snapshot pruning, vault-triggered infra-apply, Kuma wiring docs, CD `COOLIFY_API_BASE_URL` fix) → **merged #179 (2026-09-03)**
18. Log Consolidation + Midtrans + Booking Date Fix + Payment UX (LOG-CONSOLIDATION-PAYMENT-UX — one `request_complete` log line, `rpc_error` correlation, purchase error toast + Test Mode labels, Midtrans Snap provider behind the `PaymentProvider` port, timezone-derived session start) → **merged #189 (2026-09-04)**
19. CI Dependabot Fix (CI-SANITY F9 regression — restored `|| github.token` checkout fallback, explicit default-branch fetch before `turbo --affected`, Semantic PR job renamed `lint` → `semantic-pr`, pinned lint/format auto-fix versions) → **merged #190 (2026-09-04)**
20. Semantic PR Docker Type (CI-SANITY follow-up — `docker` type added to the Semantic PR workflow) → **merged #193 (2026-09-04)**
```

Production Readiness (#18) and Infrastructure (#19) merged to main. Deferred ops code gaps (1.1–1.8) are merged; Redis session caching remains deferred. PRD gaps backend (G1–G20) landed on main, and **BACKEND-HARDENING-PHASE2 (PRs 1–6) merged to main via #46** — security hardening, group-booking money correctness, late-cancel penalty, email outbox, R2 uploads, group-series, deadline repricing, payment notifications, meeting event lifecycle, SLA escalation. **BACKEND-REVIEW-HARDENING merged to main via #48** — the 2026-08-15 review fixes (money correctness, security, reliability, Redis mandatory). **REVIEW-FIXES-2 merged via #50–#57** (wave-2 findings), **REVIEW-FIXES-3 merged via #59–#65** (wave-3 findings), **REVIEW-FIXES-4 merged via #68–#70, #75–#76** (wave-4: docs/sdd reconciliation, money-correctness bugs C1–C3/H1–H6/M1–M9/L1–L5, Xendit provider rewrite for the 2024-11-11 API, fail-loud Resend/Google Meet/R2 guards, G2 email verification). Next: remaining frontend-gap work and production ops.

## Role E2E Readiness Snapshot (2026-09-04)

Use this section as the current role-readiness baseline. Re-audit only after the related backend or frontend plans materially change.

**2026-08-14 update:** Backend PRD gaps (G1–G20) landed on main (#35, #36, #39–#43). Tutor reschedule (propose/accept/reject) and session notes are now backend-ready; group invite accept/decline/reconfirm UI and admin override/room UI remain frontend work (FRONTEND-GAPS-SPEC).

### Student

The student My Profile surface supports self-service account name and profile-image updates through Better Auth, alongside learning/contact fields. The sign-in email remains read-only on this page. The compact identity header exposes photo editing through the avatar itself, with a pencil badge communicating that it is clickable. Students upload a JPG, PNG, or WebP photo, adjust the visible area with a circular drag/zoom crop editor, and save the resulting square avatar through the existing protected Upload Module. Student identity edits do not require admin review.

Student profile UX is organized as a responsive account-identity card plus separate learning and parent/guardian sections. The page shows profile completion, keeps account identity saving separate from learning-profile saving, and uses one visible save action for the learning fields. It reads the student row through the focused `auth.getProfile` procedure and treats a missing row as the initial empty form, so the page does not depend on the wallet/tutor aggregate in `auth.me`.

**Primary promotion flow is ready:** email/password auth -> tutor discovery -> solo booking -> Marks hold -> booking list/detail -> cancellation. Profile, balance/top-up, basic achievements, notification bell, calendar export, and WhatsApp contact surfaces are also present. WhatsApp support actions confirm the destination (`+62 881-0119-90195`) before opening it in a new tab.

Economy role coverage is ready: students see computed Marks prices and cannot open admin economy settings; tutors see IDR honorarium setup without Marks cash-out language; admins can update the active Cogito take schedule and see it persist after reload. Economy take changes do not create tutor notifications because tutors do not need the platform take schedule.

The 2026-09-04 browser rerun passed all 13 tests across the four `packages/e2e` specs. E2E setup resolves the seed student by email before cleanup and resets test economy defaults, while the admin economy form accepts locale-formatted IDR values without exposing a Selia field-context error. The pass covers the online group invite -> participant confirmation -> tutor acceptance path, tutor decline with a required reason, cross-student booking access denial, the admin future-booking economy snapshot path, rejection of a negative IDR amount, and booking-list containment at 170px and 390px. The layout spec is order-independent: it checks either the seeded booking rows or the empty collection state. The query client does not retry deterministic `BAD_REQUEST`/`FORBIDDEN`/`NOT_FOUND`/`UNAUTHORIZED` responses, so access and validation errors surface promptly instead of leaving the detail skeleton in a retry loop.

Booking detail uses a task-detail layout shared by student, tutor, and admin views: a compact identity-and-status header, role-appropriate primary actions directly below the status badge, a primary content flow for overview, series sessions, notes/reports, and activity, plus a sticky metadata rail for contextual actions and role-appropriate financial information. The overview keeps participant names and profile images visible without a separate low-priority rail card. Admin operations composes the same page through explicit header, main-content, sidebar, and activity slots, preserving room assignment, review context, participant wallet/ledger inspection, wallet impact, state history, and override controls without giving admins student/tutor lifecycle actions. All existing lifecycle actions and data remain available without changing the booking API.

The admin booking detail is a refresh-safe page at `/admin-operations/bookings/:bookingId`, rather than a separate visual inspector. Its admin-only extensions keep the shared responsive shell consistent while retaining the wider operational read model and controls. This is presentation-only; no RPC, schema, or persistence contract changed.

Tutor booking review uses a compact responsive accept/decline dialog. The accept path shows the scheduled date/time, modality, attendance, and the next state transition before calling the existing tutor action; the dialog is informational and does not add a new backend procedure.

Booking cancellation and session completion also use in-app Selia confirmation dialogs. Global success/error toasts render above dialog layers so mutation feedback remains visible while a modal is open; native browser confirmation prompts are not used.

Form controls use Selia wrappers for multiline text, numeric amounts, calendar dates, and minute-level times. App-level raw browser date/time/number/select/textarea controls are not used; the wrappers retain semantic native elements underneath for accessibility and form behavior. Text-entry controls in the shared `Input`, `NumberField`, and `Textarea` variants use an explicit 16px font size below the `lg` breakpoint so mobile browsers do not zoom on focus, then use the tokenized `text-base` size from `lg` upward. Portal-based Selia popups use an overlay layer above dialogs, including date and select controls inside the student achievement form.

**Tracked PRD product surfaces are complete:** group/series booking UI, reschedule accept/reject, lateness/no-show reporting, public achievements, F1 admin operations, F9 rich-text session notes, F18 proposer-side invite withdrawal, J2 session-expiry warning, and the dead-component cleanup are implemented. Backend support for the related workflows (G1/G6 and the existing booking procedures) has landed. Booking reliability follow-up now also covers flat-price reconfirmation, offline room schedule synchronization during reschedule, and suspended-tutor restoration. Operational follow-ups remain in `docs/plans/active/DEFERRED-OPS-TASKS.md`.

### Tutor

The tutor workspace now has the primary management surfaces: the tutor profile editor at `/profile`, a Calendly-style availability page, the shared role-aware `/bookings` list, and booking detail actions for accept, decline, and complete. Tutors configure multiple weekly-hour ranges per weekday, copy a range to weekdays, choose modality per range, and generate concrete future windows through an end date (up to 52 weeks). Weekly range rows keep both minute-time fields at the compact width used by the start field, show a centered dash between them, and let their autocomplete popup size to its contents beyond the field. Modality triggers keep their icon and label side by side. Date-specific overrides supersede only the conflicting recurring occurrence, while the weekly calendar preview exposes and removes individual generated windows. Existing bookings remain intact because replacement soft-deactivates availability rather than deleting referenced rows. The legacy `/tutor-bookings` route remains as a compatibility redirect to `/bookings`; tutor list data now comes from protected `booking.listMine`, not the proposer-only query. The legacy `/onboarding` route redirects tutors to `/profile` and other roles to `/dashboard`. After a tutor submits the profile for review, the form awaits the existing profile/auth cache invalidation and navigates to `/dashboard` with history replacement.

Published tutor profiles remain editable. Bio edits and tutor-set base honoraria publish immediately; a new honorarium applies only to future bookings. Existing bookings keep their stored price snapshot, including the original tutor honorarium, for weekly payout. Other trust-sensitive edits are held in `pendingProfileChanges` with a separate edit-review status, so discovery continues serving the last approved profile until an admin approves the proposal or requests revisions.

The tutor profile editor keeps one combined **Achievements & experience** section: structured education (up to two entries), competition achievements (up to five entries), and experiences (up to five role/organization/year/description entries). Short bios are limited to 50 words. The structured editors preview normalized public output; achievement and experience year fields stay as plain digits without grouping dots, and an ongoing experience leaves End year blank. Older profiles still fall back to legacy `achievements`/`credentialsSummary` and `experiences` text when no structured entries exist. Each subsection keeps its own optional private proof URL list, while the form recommends one Google Drive folder with the “Anyone with the link can view” setting for both evidence types. Tutors submit one canonical profile image; for published tutors, a changed image waits in review while the Cogito admin applies the standard background and updates the same account image. Profile status and feedback stay visible above the form. Base honorarium uses Rp 5,000 steps and a combined six-row IDR matrix. Public profile occupies its own full-width row; Teaching setup and payout account share the next two-column row. The payout form captures complete destination-account details and transfer responsibility. Only conventional BCA is fee-free; BCA Syariah, blu (BCA Digital), and other banks incur Rp2,500 per payout. The tutor sidebar exposes this surface as **Tutor Profile**; the avatar menu keeps **Profile** for students and omits it for tutors and admins. Admins can still use the dedicated Manage Tutors review surface, but `/profile` redirects them to `/dashboard`.

Manage Tutors shows at most three invitations and five tutor profiles per page in compact Selia tables and paginates each list independently. Invitation operations are grouped into a per-row actions menu. The invitation table uses semantic status badges: invited is warning, accepted is success, and expired/revoked are danger; unknown values fall back to secondary. Tutor details open on demand in a right-side review drawer, which retains the full achievements, experiences, section-specific private proof links, current/proposed profile photos, admin edited-photo upload, audit-backed photo/review history, and review-action workflow without overwhelming the index page. The tutor-facing history endpoint returns actor id/name metadata without account email addresses, while the admin drawer retains the richer moderator context. Status filter changes reset the corresponding list to page one. Both tutor drawers keep the profile body scrollable inside the viewport while their header/actions remain visible.

Tutor specializations are normalized in `subject_category` (self-referencing category/specialization hierarchy) and `tutor_profile_subject` (profile-to-specialization join). Migration `0029_competition_taxonomy.sql` archives the previous catalog with `is_active = false` and seeds the seven current competition categories plus 33 specializations. The legacy `expertise` array remains readable for compatibility, while onboarding and published discovery use normalized specializations. Specialization changes on a published profile follow the existing pending-review path and are applied atomically when an admin approves the edit. The onboarding selector shows all current categories with checkboxes and renders archived profile specializations as read-only labels; raw subject IDs should never be shown to tutors or students. Migration `0039_secret_blink.sql` adds the JSONB `education` and `competition_achievements` fields with empty-array defaults, and migration `0040_colossal_morlun.sql` adds the JSONB `experience_entries` field with an empty-array default while promoting legacy tutor portraits into `user.image` when needed and removing the duplicate source-photo column; old `credentialsSummary` and `experiences` content remains available through the public fallback until an admin or tutor supplies structured entries.

The primary Tutor E2E flow has been manually verified with seeded accounts, including availability, incoming booking review, online meeting-status handling (real provider or manual fallback), student notification/state, and completion. Tutor reschedule, session notes, payout, and individual series completion are now backend-ready (G6/G7/G16/G18); their UI is tracked in FRONTEND-GAPS-SPEC (F6/F7/F8/F9/F13 closed). Session notes support the shared rich-text toolbar and DOMPurify render pass on completed bookings. Lateness/no-show support is backend-ready via `support.createTicket` (G1) with the report UI implemented (F3, merged #55). Assigned tutors can now add or replace a meeting URL from booking detail when automatic setup is unavailable; the API limits this to their own online `confirmed`/`scheduled` bookings, while admins retain the operations fallback. The local 2026-08-26 run detected an expired/revoked Google Meet token; online acceptance correctly remained `confirmed` with meeting setup attention instead of falsely claiming the session was scheduled.

### Admin

Backend is ready for user role management, tutor invite/review, structured tutor achievement editing, achievement moderation and public achievement surfacing, the full booking operations console (queue/override preview/refund), room list/create/assign/relocate, wallet/ledger lookup, tutor payouts, refund corrections, the active economy schedule, and manual meeting-link fallback for eligible online bookings. Admin wallet lookup resolves visible user identity through `admin.searchUsers` (name/email/ID) before reading the selected wallet and ledger. The /admin-economy screen lets admins edit the four Cogito take fields in Rp 5,000 increments with optimistic versioning; updates are audit-logged and apply only to future/new repricing snapshots. The admin tutor review card resolves pending `subjectIds` through the active normalized taxonomy and renders readable category/specialization labels with wrapping values; it also lets admins correct structured education and competition entries through the version-checked `adminTutor.updateTutorAchievements` procedure, with an audit event for each save.

The admin override queue, wallet/ledger view, override preview, room assignment → scheduled transition + notifications, room availability/approval backend (G8–G10, G13–G14), and the read-only all-bookings view at `/bookings` have landed. The admin workspace is now available at `/admin`; its operations queue provides category/urgency/SLA filters, exact booking-number search, OQ-04 business-hours deadlines, escalation status/channel, and report context. Queue rows display the immutable human-readable booking reference (`#N`) while retaining the UUID behind the detail link, and each row links to the admin-only `/admin-operations/bookings/:bookingId` page, where the full participant read model, per-wallet balances, booking-scoped ledger entries, meeting fallback, state history, and override action remain available in a refresh-safe layout. The override form loads the booking roster and presents affected participants as a name/avatar/role multi-select; selected user IDs are serialized automatically for the unchanged preview/apply contract. The queue table uses stable column widths, top-aligned content, readable body text, and non-wrapping status badges. On narrow viewports, the monitor card remains constrained to the content viewport and only the table container scrolls horizontally. The **Room approvals** tab now includes the active-room catalog and Add room dialog backed by `room.create`, while its `room.listPendingApprovals` section remains the cross-booking queue; requested rooms can be assigned inline, while **Choose room** / **Choose another** opens the admin-only booking detail Offline room card for context-aware assignment or relocation. No admin room flow requires typing a booking UUID. F1/F2/F11/F12 are closed. Backend U-item sub-gaps are tracked in `docs/plans/active/PRD-GAPS-PHASE3.md` (all closed; U9 closed by REVIEW-FIXES-4 P2.8). The admin economy UI was browser-verified for role denial, valid future-booking snapshot updates, and invalid negative amounts; no UI access bypass was found.

### Backend Gap Groups

- Ready now (merged to main): student solo/group/series booking primitives, reschedule propose/accept/reject, session notes, group invite confirm/decline/reconfirm/withdraw, wallet/ledger/packages/Knowledge Bank, purchases, achievements, notifications, tutor profile/availability/payouts/incoming-booking actions, support tickets (G1), and the admin capabilities listed above (G8–G10, G16–G18).
- Backend PRD U-items (all closed, verified 2026-08-18): manual meeting-link entry (U1→`adminBooking.setMeetingLink`, plus assigned-tutor `tutorActions.setMeetingLink`), student self-reschedule (U2), reconfirmation-deadline repricing (U3), group-series full withdrawal blocked (U4), per-participant no-show (U5), admin per-session cancel (U6), per-session reschedule (U7), refund reconciliation guard (U8), **business-hours SLA windows (U9 — closed by REVIEW-FIXES-4 P2.8)**, achievement field parity (U10), registered-user invitee validation (U11), offline room deadline (U12), KB total-balance eligibility (U13), offline room availability in booking creation (U14). Dead-code/silent-failure items tracked in `docs/plans/completed/BACKEND-CLEANUP.md` (completed).

### Current Execution Order

1. Complete Admin Tutor invite -> claim -> onboarding -> review -> publish E2E and verify published discovery.
2. Refresh the real Google Meet credential and rerun the online-provider smoke path before recording marketing footage; the manual-link fallback remains intentionally available.
3. Close the production deployment-readiness items in `docs/plans/active/DEPLOYMENT-PLAN.md` before enabling real payments and scheduled jobs. The production domain may run Xendit Test Mode first with the UAT allowlist; real payments remain disabled until the sandbox checklist and live smoke are complete.
4. Keep the approved-achievement public surfacing smoke check in the release checklist; the student list and admin moderation queue now use horizontally scrollable tables, including narrow-viewport coverage.
5. Admin booking override and offline-room UI (F1/F2/F11/F12) — backend landed (G8–G10, G13–G14); F1/F2/F11/F12 implemented, including the dedicated admin workspace, hydrated participant wallet/ledger detail, and OQ-04 SLA projection.

## Known Bugs

### Existing bugs (planned in `docs/plans/completed/PRODUCTION-READINESS-PLAN.md`)

| ID  | Bug                                                | Priority | Status    |
| --- | -------------------------------------------------- | -------- | --------- |
| B5  | No CSRF protection on mutations                    | P0       | **Fixed** |
| N3  | Scheduler not shut down gracefully                 | P1       | **Fixed** |
| N8  | withdraw doesn't release other participants' holds | P2       | **Fixed** |

The following bugs from the production-readiness plan are **fixed** (see completed plan for details): B1 (double session validation), B2 (meeting rollback), B3 (refund correction), B4 (series deadline), N1 (release holds), N2 (send emails), N4 (series sessions), N5 (listLedger filters), N7 (randomUUID), N15 (holdAmount update), B6 (overlap check in tx). N9 (pagination) was also fixed by PR #28 — `listBookingsByState` in `admin-booking.repo.ts:94` now consumes the cursor (`gt(booking.id, cursor)`).

### Frontend error UX TODO

- Map oRPC/Zod input-validation issues to field-specific, non-technical messages across every form. Raw transport errors such as `Input validation failed` must never be shown directly to users. The solo-booking form currently provides a readable fallback, but a shared mapper remains to be implemented.

**Remaining deferred items** are tracked in `docs/plans/active/DEFERRED-OPS-TASKS.md`:

- Redis session caching (2.2) — not yet implemented

**Fixed by PR #28 (`improvement/foundation-critical-fixes`):**

- Redis rate limiting and composition-root wiring
- Atomic idempotency get-or-set flow
- Migration journal, missing indexes, and booking-participant uniqueness
- Notification scheduling, BullMQ retry backoff, and Redis health check
- Admin and student booking pagination cursor consumption
- Wallet atomic balance guards and explicit wallet repository columns
- Admin override correctness and optimistic locking
- Payment/refund bounds and pending-provider retry handling
- Series future-slot validation and Tutor booking route guard
- Discovery search escaping and nginx security headers

### New findings (planned in `docs/plans/completed/FOUNDATION-HARDENING.md`)

Status column: **Fixed** = verified in code on main after #17 merge; **Open** = not yet implemented.

| ID  | Bug                                                                    | Priority | Story | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Group booking cancel doesn't release invitee holds                     | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A2  | Group booking tutorDecline doesn't release invitee holds               | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A3  | expireBookings doesn't release invitee holds                           | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A4  | withdraw→cancel doesn't release other participants' holds              | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A5  | confirmedHeadcount not decremented on withdraw                         | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A6  | holdAmount not zeroed on cancel/decline/expire                         | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A7  | Series cancel doesn't cascade to bookingSession rows                   | P0       | 1     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B1  | RESCHEDULE_PROPOSED has no expiry — booking stuck forever              | P0       | 2     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B2  | AWAITING_ADMIN_ROOM_APPROVAL/SCHEDULED not in expiry cron              | P0       | 2     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C1  | booking.get() IDOR — no ownership check                                | P0       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C2  | booking.listSessions() IDOR — no ownership check                       | P0       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C3  | Tutor actions lack tutorProcedure role guard                           | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C4  | resendInvite doesn't invalidate old token                              | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C5  | OpenAPI spec exposed without auth                                      | P1       | 3     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C6  | No password policy                                                     | P1       | 4     | **Fixed** — `minPasswordLength: 8` + `assertPasswordPolicy` upper/lower/digit enforced server-side at sign-up (REVIEW-FIXES-3 P6, #65)                                                                                                                                                                                                                                                                                                                      |
| D1  | Wallet ledger insert not atomic with balance update                    | P0       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2  | 8 read-then-write race conditions without optimistic lock              | P1       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D3  | Payment webhook out-of-order delivery — user not credited              | P0       | 5     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D4  | Booking creation has no idempotency key                                | P1       | 7     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E1  | notification.write() swallows all errors silently                      | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E2  | Google Meet + Resend calls have no timeout                             | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| E3  | No statement_timeout on DB pool                                        | P1       | 6     | **Fixed** (`packages/db/src/index.ts:20` — `statement_timeout: 30_000`)                                                                                                                                                                                                                                                                                                                                                                                     |
| E4  | No uncaughtException handler                                           | P1       | 6     | **Fixed** (`apps/server/src/index.ts:24`)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| E5  | Webhook timestamp validation disabled outside production               | P1       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F1  | Unbounded string inputs (no .max()) — DoS vector                       | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F2  | Unbounded array inputs (no .max())                                     | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F3  | Dates not validated to be in the future                                | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| G1  | No session expiry configured                                           | P1       | 4     | **Fixed** (`packages/auth/src/index.ts:39` — `expiresIn: 60*60*24*7`)                                                                                                                                                                                                                                                                                                                                                                                       |
| G2  | No email verification flow (DEFERRED to production-readiness/PRD-gaps) | P1       | 4     | **Fixed (REVIEW-FIXES-4 P4.4)** — better-auth `emailOTP` plugin (6-digit OTP, 5 min expiry, `sendVerificationOnSignUp`) plus sign-in routing for legacy and new unverified accounts, OTP delivered via the shared email port (`setVerificationEmailSender` + `buildVerificationEmail`); the automatic signup OTP also carries the P2 welcome/onboarding copy in the same email, `/verify-email` UI route; `auth.api.verifyEmailOTP` marks the user verified |
| G3  | Google OAuth credentials fall back to empty string                     | P2       | 4     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| G4  | No CSRF token (sameSite=none in production)                            | P0       | 4     | Fixed — session cookies remain sameSite=strict in production; the short-lived OAuth state cookie is sameSite=lax for the Google top-level callback and remains signed, secure, and httpOnly                                                                                                                                                                                                                                                                 |
| H1  | CSP incomplete — production-breaking (no connect-src)                  | P0       | 8     | **Fixed** (`packages/api/src/lib/security-headers.ts:15` — `connect-src 'self' ${corsOrigin}`)                                                                                                                                                                                                                                                                                                                                                              |
| I1  | findBookingsExpiringByDeadline has no LIMIT — OOM risk                 | P1       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| I2  | Missing composite index for overlap check query                        | P2       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| I3  | Dev DB logging may expose sensitive params                             | P2       | 8     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| J1  | No React error boundary — blank page on crash                          | P1       | 9     | Fixed (`apps/web/src/components/error-boundary.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                        |
| J2  | No auth session expiry handling on frontend                            | P1       | 9     | **Fixed (2026-08-22)** — authenticated shell warns during the final 30 minutes, offers sign-in again, and preserves the existing 401 redirect                                                                                                                                                                                                                                                                                                               |
| J3  | 4 dead frontend components                                             | P2       | 9     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| J4  | `any` type casts in route files                                        | P2       | 9     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| K1  | No constant-time comparison for signatures/tokens                      | P2       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| K2  | No body size limit on webhook endpoints                                | P2       | 6     | Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| K3  | Scheduler jobs have no retry attempts                                  | P2       | 8     | Fixed — all 6 repeatable jobs have `attempts: 3` + exponential backoff; DLQ added (prod-fixes M4): failed jobs land in `cogito-jobs-dlq` + bounded Redis list `cogito:dlq` (100 entries)                                                                                                                                                                                                                                                                    |
| K4  | DRAFT and AWAITING_MARKS_HOLD are unreachable dead states              | P3       | 2     | Accepted (dead states, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| K5  | repricedMarks column is dead — never set or read                       | P3       | 2     | Accepted (dead column, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| K6  | timezone field stored but never used                                   | P3       | 2     | Accepted (stored, no action needed)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| K7  | metrics.ts has no TTL eviction for stale path entries                  | P3       | 9     | Fixed — `lib/metrics.ts` evicts entries older than 10 min (cleanup every 60s)                                                                                                                                                                                                                                                                                                                                                                               |

### 2026-08-14 audit additions (implemented in `docs/plans/completed/BACKEND-HARDENING-PHASE2.md` via PR #46)

Status: verified at git HEAD `ec8b16c` (post-#46 merge). B3/B4/B6/B8/B9 are **Fixed**; U13 remains retained as an implemented reference in `docs/plans/active/PRD-GAPS-PHASE3.md`.

> Note: these B-IDs are distinct from the B1–B6/N-series IDs in the production-readiness plan above (same letter, different findings).

| ID  | Finding                                                                                                                                                                                           | Severity | Status                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| B3  | Group booking with 2 ≤ headcount < target EXPIRES at the 12h deadline instead of repricing + reconfirming (FR-16/TC-18) — `expireBookings` `booking.service.ts:2009-2048` has no headcount branch | High     | **Fixed (#46)** — headcount branch reprices to `AWAITING_RECONFIRMATION` + 12h deadline + notify. Reconfirmation-deadline sub-case → U3 |
| B4  | Knowledge Bank eligibility uses `availableBalance` not total balance (DL-16) — `wallet.service.ts:431`                                                                                            | Medium   | **Fixed (REVIEW-FIXES-2 PR F / U13)** — `knowledgeBankEligible` uses total balance, so held Marks count                                 |
| B6  | No payment/refund notifications at all (notification matrix rows unfulfilled) — `payment.service.ts` writes none                                                                                  | Medium   | **Fixed (#46)** — `payment.{id}.credited`/`.refunded` (+ admin refund payer notify)                                                     |
| B8  | Group-series creation flow missing entirely — `createSeries` hardcodes `targetGroupSize:1` (FR-20 TC-24/25/27/28/30/32-34) — `booking.service.ts:1881`                                            | Medium   | **Fixed (#46)** — `createGroupSeries` with upfront per-session holds                                                                    |
| B9  | `cancelSession` after H-2 throws instead of forfeiting Marks (series rules) — `booking.service.ts:1134-1140`                                                                                      | Low-Med  | **Fixed (#46)** — post-H2 cancelSession forfeits the session hold                                                                       |

**Security items (all resolved in #46 unless noted):**

- ✅ Stub payment checkout flag-gated (`STUB_WEBHOOK_ALLOWED` + `NODE_ENV` not production-like + provider check; staging is production-like — C2)
- ✅ `TRUST_PROXY` handling — `getClientIp` uses `x-forwarded-for` first hop only when trusted
- ✅ Seed script production guard (`SEED_ALLOWED_IN_PROD` + `SEED_ADMIN_PASSWORD` min 12 chars)
- ✅ Webhook idempotency atomic — `IdempotencyStore.claim` keyed on verified payload event id
- ✅ Invite (10/min) + booking creation (30/min) rate limits
- ✅ M3 (prod-fixes): support ticket creation (5/min), achievement submission (30/min), upload URL creation (30/min) rate limits; email-OTP / forget-password / change-email auth paths throttled
- ✅ `PAYMENT_PROVIDER=xendit` requires Xendit credentials (no silent stub fallback)
- ✅ Xendit mode is explicit (`XENDIT_MODE=test|live`); production/staging Test Mode requires `XENDIT_TEST_ALLOWED_EMAILS` so sandbox purchases are limited to UAT accounts
- ✅ Unbounded `reason` inputs bounded (`.max(500)`) + `escapeHtml` in email bodies (adminNote interpolation tracked in BACKEND-CLEANUP)
- ✅ OpenAPI spec auth-gated in non-production; read-time body-size enforcement (413)
- Remaining: RPC rate-limit path bug (R1) was **Fixed** (wave-2); password policy (C6) is **Fixed** (wave-3 P6) — see the tables below.

### 2026-08-15 wave-2 findings (tracked in `docs/plans/completed/REVIEW-FIXES-2.md`)

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                             | Location                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| R1  | HIGH     | RPC rate-limit paths use dotted keys; real URLs are slash keys — limits never fire. **FIXED** (PR A): path matching extracted to `rate-limit-paths.ts` (`matchRateLimitPath`/`matchAuthPath`), tested in `rpc-rate-limit.test.ts`                                                                                   | `routes.ts`, `rate-limit-paths.ts`                 |
| R2  | HIGH     | Solo `withdraw` from CONFIRMED/SCHEDULED → `AWAITING_RECONFIRMATION` instead of CANCELLED (hold not zeroed, Meet link not cancelled, withdrawn student can reconfirm into a no-hold booking). **FIXED** (PR B): solo CONFIRMED/SCHEDULED/AWAITING_ADMIN_ROOM_APPROVAL → CANCELLED + hold zeroed + meeting cancelled | `booking.service.ts` (withdraw)                    |
| R3  | HIGH     | `meeting.cancelEvent` inside the withdraw tx isn't rolled back if the reprice throws. **FIXED** (PR B): provider call deferred until after `db.transaction` commits (`cancelMeeting` flag)                                                                                                                          | `booking.service.ts` (withdraw)                    |
| R4  | MED      | Historical presigned-POST policy omitted `x-amz-algorithm/credential/date` conditions — R2/S3 rejected unmatched form fields. **SUPERSEDED** (2026-09-01): R2 now uses the AWS SDK presigned PUT flow with signed content type/length; the obsolete POST policy implementation was removed.                         | `storage.ts` (current R2 PUT flow)                 |
| R5  | MED      | REFUNDED webhook keeps credited marks; `mapXenditStatus` lacks REFUNDED (real Xendit refund 500s). **FIXED** (PR C): REFUNDED webhook reverses credited marks via `compensate_deduct` (`refund.{id}.reverse` key); `mapXenditStatus` maps REFUNDED                                                                  | `payment.service.ts`, `xendit-payment.provider.ts` |
| R6  | MED      | Outbox stale-`sending` reclaim ignores the attempts budget. **FIXED** (PR D): stale reclaim requires `attempts < MAX_DISPATCH_ATTEMPTS`                                                                                                                                                                             | `notification.repo.ts` (claimPendingDispatches)    |
| R7  | MED      | Webhook idempotency claim locks the key 24h on crash. **FIXED** (PR D): claim uses a 120s TTL (processed records still stored for 24h)                                                                                                                                                                              | `payments.ts` (webhook claim)                      |
| R8  | MED      | `waitForMeetUrl` failure after successful insert → duplicate Google events on retry. **FIXED** (PR D): poll failure keeps the created row with `meetingUrl: null`                                                                                                                                                   | `google-meeting.provider.ts` (createEvent)         |
| R9  | LOW      | `eventName` unescaped in the adminReview notification body. **FIXED** (PR D): escaped via `escapeHtml`                                                                                                                                                                                                              | `achievement.service.ts` (adminReview)             |
| R10 | LOW      | `seed-invite.ts` prints the stored token hash as if it were the plaintext. **FIXED** (PR D): prints a fresh-invite hint instead                                                                                                                                                                                     | `seed-invite.ts`                                   |

### 2026-08-17 wave-4 findings (tracked in `docs/plans/completed/REVIEW-FIXES-4.md`)

| ID  | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Location                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | CRITICAL | Group `markParticipantNoShow` transitions the whole booking to NO_SHOW and strands other participants' holds (PRD: one no-show forfeits only their own Marks). **FIXED** (REVIEW-FIXES-4 P2.1): group no-show forfeits only the target's hold, keeps the booking live, recomputes `holdAmount` from remaining confirmed participants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `booking.service.ts` (markParticipantNoShow)                                                                                                                                                                                                                                                                                                                                                                                      |
| C2  | CRITICAL | Student bypasses the H-2 late-cancel penalty via `proposeReschedule` (no guard that the **current** session is still > H-2 out). **FIXED** (REVIEW-FIXES-4 P2.2): the student branch now requires `b.scheduledStartAt - now > LATE_CANCEL_THRESHOLD_MS` (mirrors `cancel()`); the tutor proposal path and the new-slot H-2 rule are unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `booking.service.ts` (proposeReschedule)                                                                                                                                                                                                                                                                                                                                                                                          |
| C3  | CRITICAL | `completeSession` (solo/group) has no "session started" guard (tutor can deduct held Marks before the session) while `completeSeriesSession` has one. **FIXED** (REVIEW-FIXES-4 P2.3): `completeSingleSession` now throws `BookingSessionNotStartedError` when `b.scheduledStartAt > now`, after the SCHEDULED check and before any wallet deduct; completion at/after start (incl. the start+15min lateness edge) is unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `booking.service.ts` (completeSession)                                                                                                                                                                                                                                                                                                                                                                                            |
| H1  | HIGH     | Accepted reschedule keeps the deadline at proposal `now+24h` — a reschedule for a session 2 weeks out is auto-cancelled ~24h later and holds released. **FIXED** (REVIEW-FIXES-4 P2.4): `acceptReschedule` now refreshes the deadline for SCHEDULED targets (offline `proposedEndAt+2h`, online `proposedEndAt+24h`, mirroring `transitionBookingToScheduled`/`finalizeMeetingSchedule`) and for AWAITING_ADMIN_ROOM_APPROVAL targets (`min(now+12h, proposedStartAt)`, mirroring the creation path); AWAITING_TUTOR_REVIEW keeps the 12h window. Also restores `expired` to the `reschedule_status_check` constraint (migration 0024) so the RESCHEDULE_PROPOSED expiry branch works                                                                                                                                                                                                                                                               | `booking.service.ts` (propose/accept/expire), `packages/db/src/migrations/0024_reschedule_status_expired.sql`                                                                                                                                                                                                                                                                                                                     |
| H2  | HIGH     | Tutor-lateness handling flawed both ways: pre-marking attendance dodges detection; taught-but-unmarked sessions auto-cancel + release holds. **FIXED** (REVIEW-FIXES-4 P2.5): `markTutorAttendance` is now allowed only within `[scheduledStartAt ± 15 min]` (`BookingNotEditableError` otherwise, so pre-marking is impossible); `checkTutorLateness` no longer auto-cancels or releases holds — it keeps the session SCHEDULED with holds intact, merges `overrideMeta.category = "tutor_lateness_pending"` (surfacing the booking in the `adminBooking.listBookings({ category })` queue, reachable via the RPC's `listOverridesInput` filter), writes a `tutor_lateness_pending_review` audit record, and notifies the proposer + tutor. Flagging is idempotent: the lateness sweep excludes already-flagged bookings, so repeat sweeps do not re-flag or duplicate audit/notification rows. NO_SHOW for tutor absence is now an admin decision | `booking.service.ts` (markTutorAttendance, checkTutorLateness), `booking.repo.ts`, `admin-booking.types.ts`                                                                                                                                                                                                                                                                                                                       |
| H3  | HIGH     | `relocateRoom` doesn't transition `AWAITING_ADMIN_ROOM_APPROVAL` → SCHEDULED (unlike `assignRoom`), so relocated bookings get expired by the deadline job. **FIXED** (REVIEW-FIXES-4 P2.6): `relocateRoom` now takes an `actorId` and calls `transitionBookingToScheduled` after inserting the new CONFIRMED roomBooking (mirroring `assignRoom`); the safe no-op guard keeps an already-SCHEDULED booking untouched, and the relocated booking's deadline is bumped to `scheduledEndAt + OFFLINE_SCHEDULED_GRACE_MS` so the expiry sweep cannot cancel/no-show it. Covered by `room-relocate.test.ts` (relocate from awaiting → SCHEDULED + deadline bump; from scheduled → no-op; notifications; expiry sweep survival)                                                                                                                                                                                                                           | `room.service.ts` (relocateRoom), `room.handler.ts`                                                                                                                                                                                                                                                                                                                                                                               |
| H4  | HIGH     | REFUNDED webhook auto-reversal throws when Marks already spent → webhook 500/retry loop instead of admin reconciliation. **FIXED** (REVIEW-FIXES-4 P2.7): `confirmFromWebhook`'s REFUNDED branch reads the wallet via `getOrCreate` before compensating; when `availableBalance < record.marks` it marks the payment REFUNDED, writes a `refund_webhook_reconciliation` audit record and a `refund_record` row (`reason` "REFUNDED webhook: marks already spent; manual reconciliation required") for admin, and skips the reversal + refund notification — no throw, no 500/retry loop. The clean case (available balance >= marks) still reverses via `compensate_deduct` (`refund.{id}.reverse`) and notifies as before (R5). Covered by `refund-flow.test.ts` (H4) + `payment.service.test.ts`                                                                                                                                                  | `payment.service.ts`, `payment/index.ts` (PaymentAuditPort, PaymentRefundRecordPort)                                                                                                                                                                                                                                                                                                                                              |
| H5  | HIGH     | Support SLA is flat 12h; no business-hours/WIB computation or WhatsApp escalation; no auto-ack on ticket creation (PRD OQ-04). **FIXED** (REVIEW-FIXES-4 P2.8): `computeSlaDeadline` applies the OQ-04 rule (30 min Mon–Sat 09:00–21:00 WIB, else 4h; wall-clock), tickets are auto-acknowledged on creation, and escalation emits a `support.{id}.escalated` notification row (metadata `whatsappTarget: +62881011990195`) as the hook a future WhatsApp adapter consumes                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `constants.ts`, `support.service.ts`                                                                                                                                                                                                                                                                                                                                                                                              |
| H6  | HIGH     | `applyOverride` to terminal states never cancels the Google Meet event (unlike every other terminal path). **FIXED** (REVIEW-FIXES-4 P2.9): `applyOverride` calls `meeting.cancelEvent(bookingId)` best-effort after the tx commits for terminal transitions (mirroring `cancel()`); a Google failure is logged and never breaks the override                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `admin-booking.service.ts` (applyOverride)                                                                                                                                                                                                                                                                                                                                                                                        |
| M1  | MED      | `applyOverride` with `marksAction` but empty `affectedParticipants` silently no-ops the money action → stranded holds. **FIXED** (REVIEW-FIXES-4 P2.9): `planOverride` throws `OverrideMarksParticipantsRequiredError` (400) when a `marksAction` is provided without a non-empty `affectedParticipants`, so a money action is never a silent no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `admin-booking.service.ts`                                                                                                                                                                                                                                                                                                                                                                                                        |
| M2  | MED      | `expireBookings` SCHEDULED→NO_SHOW **releases** holds instead of forfeiting (PRD: no-show → deduct). **FIXED** (REVIEW-FIXES-4 P2.10): the no-show branch now deducts each confirmed participant's held amount (`booking.{id}.no_show.{userId}` event key, `system` actor) and zeroes the participant hold, then transitions to NO_SHOW — the "forgot to click anything" default enforces the forfeit; release stays for genuinely pre-start expiry states (EXPIRED/CANCELLED). Notification copy updated to "held marks were forfeited"                                                                                                                                                                                                                                                                                                                                                                                                            | `booking.service.ts` (expireBookings)                                                                                                                                                                                                                                                                                                                                                                                             |
| M3  | MED      | Proposer `cancel()` of a confirmed group **series** bypasses the no-opt-out guard and releases every participant's holds. **FIXED** (REVIEW-FIXES-4 P2.11): `cancel()` throws `BookingSeriesNoOptOutError` (409) for `type === SERIES && targetGroupSize > 1` once the series is past `AWAITING_PARTICIPANT_CONFIRMATION` — the escape hatch is an admin override; pre-confirmation cancellation still works (terminal target falls back to EXPIRED where CANCELLED is unreachable, mirroring withdraw)                                                                                                                                                                                                                                                                                                                                                                                                                                             | `booking.service.ts` (cancel vs withdraw)                                                                                                                                                                                                                                                                                                                                                                                         |
| M4  | MED      | `releaseExpiredHolds` releases holds without a state transition → later tutor accept/complete deducts from a zero hold (`InsufficientBalanceError` → delivered-but-unpaid session). **FIXED** (REVIEW-FIXES-4 P2.12): transition-or-skip — the terminal transition (shared `EXPIRY_TARGET` with `expireBookings`) is applied FIRST in the same tx and the hold is only released/forfeited after it succeeds; version conflicts, terminal bookings and RESCHEDULE_PROPOSED (owned by `expireBookings`) are skipped without touching the wallet                                                                                                                                                                                                                                                                                                                                                                                                       | `booking.service.ts` (releaseExpiredHolds)                                                                                                                                                                                                                                                                                                                                                                                        |
| M5  | MED      | Reconfirmation-decline / withdraw-pre-H2 don't refresh `deadlineAt` to `now+12h` → sub-12h reconfirmation windows. **FIXED** (REVIEW-FIXES-4 P2.13): both the reconfirm-decline survival path and the withdraw-pre-H2 regression path now call `updateBookingDeadline(now + RESPONSE_WINDOW_MS)` after repricing, so remaining participants always get a full fresh 12h window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `booking.service.ts`                                                                                                                                                                                                                                                                                                                                                                                                              |
| M6  | MED      | `cancelRoomBooking` (admin) only cancels the roomBooking row; the booking stays `AWAITING_ADMIN_ROOM_APPROVAL` until its deadline expires it (PRD FR-22 expects cancel + hold release + audit). **FIXED** (REVIEW-FIXES-4 P2.14): `cancelRoomBooking` now calls `bookingPort.cancelOfflineBooking` (new booking-service method: releases all holds, zeroes the hold, transitions to CANCELLED with reason "No room available" + audit, no-op once the booking left `AWAITING_ADMIN_ROOM_APPROVAL`) in the same transaction; the room lookup broadened to include pending `requested` rows so a never-confirmed room can be cancelled too. A SCHEDULED booking still continues without a room (G14)                                                                                                                                                                                                                                                  | `room.service.ts` (cancelRoomBooking), `booking.service.ts` (cancelOfflineBooking)                                                                                                                                                                                                                                                                                                                                                |
| M7  | MED      | Withdraw from `AWAITING_ADMIN_ROOM_APPROVAL` regresses to reconfirmation but leaves the `requested` roomBooking live for admin assign. **FIXED** (REVIEW-FIXES-4 P2.13): both the group regression path and the solo/series cancel path call `roomPort.cancelRequestedRoomForBooking` (new room-service method: cancels the pending `requested` row, no-op if already confirmed/cancelled) so an admin `assignRoom` mid-reconfirmation cannot resurrect a room for a booking heading back to tutor review                                                                                                                                                                                                                                                                                                                                                                                                                                           | `booking.service.ts` (withdraw), `room.service.ts`                                                                                                                                                                                                                                                                                                                                                                                |
| M8  | MED      | Pre-H2 withdraw group reprice throws `InsufficientMarksError` and rolls back the withdrawal (PRD TC-19: fall through to expiry). **FIXED** (REVIEW-FIXES-4 P2.15): the withdraw regression branch catches `InsufficientMarksError` from `repriceGroupForHeadcount`, releases the remaining participants' holds, zeroes the booking hold and transitions to EXPIRED (mirroring the B5 expiry fallback) — the withdrawer is never stuck in a group they cannot leave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `booking.service.ts` (withdraw/repriceGroupForHeadcount)                                                                                                                                                                                                                                                                                                                                                                          |
| M9  | MED      | Knowledge Bank eligibility was previously exposed to every protected role. **UPDATED (2026-09-01):** the endpoint and content/file paths admit students, tutors, and admins; students retain the 35-Mark total-balance gate while tutors and admins bypass it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `wallet.router.ts`, `content.router.ts`, `apps/server/src/routes.ts`                                                                                                                                                                                                                                                                                                                                                              |
| L1  | LOW      | `completeSeriesSession` can deduct more than the remaining hold after an admin `cancelSeriesSession(..., release)` → `InsufficientBalanceError`; guard with `Math.min`. **FIXED** (REVIEW-FIXES-4 P2.16): both the solo-series and group-series completion deducts are capped at the participant's remaining held amount (`Math.min(session.holdAmount, p.heldAmount)`) so a delivered session never throws on an exhausted hold                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `admin-booking.service.ts`, `booking.service.ts`                                                                                                                                                                                                                                                                                                                                                                                  |
| L2  | LOW      | `meetingEvent` row written on the global `db`, not the booking tx → tx rollback after Google event creation leaves an orphan event + row; tutor re-accept duplicates the event. **FIXED** (REVIEW-FIXES-4 P2.17): `MeetingPort.createEvent` accepts an optional `conn` (DbOrTx) and both providers write the local row through it, so the row commits/rolls back with the booking; `finalizeMeetingSchedule` passes the booking `tx` and best-effort `cancelEvent`s the provider event when the tx fails after creation (no orphan, no duplicate on re-accept)                                                                                                                                                                                                                                                                                                                                                                                      | `google-meeting.provider.ts`, `booking.service.ts`                                                                                                                                                                                                                                                                                                                                                                                |
| L3  | LOW      | "Meeting link ready" notification sent even with no URL (fallback provider) — should say "link pending". **FIXED** (REVIEW-FIXES-4 P2.17): `finalizeMeetingSchedule` derives the copy from `meetingResult.meetingUrl` — "Meeting link ready" only when a URL exists, otherwise "Meeting link pending" (manual/fallback rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `booking.service.ts`                                                                                                                                                                                                                                                                                                                                                                                                              |
| L4  | LOW      | Xendit webhook timestamp validation uses `x-timestamp`/`date`; Xendit documents only `x-callback-token` — every webhook may 408 if no `Date` header; make provider-conditional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `apps/server/src/webhooks/payments.ts`                                                                                                                                                                                                                                                                                                                                                                                            |
| L5  | LOW      | `infra/.env.prod.example`/RUNBOOK env table stale — missing R2__, GOOGLE_MEET__, GOOGLE_IMPERSONATED_USER, WEBHOOK_ALLOWED_IPS, SEED_*; RUNBOOK references non-existent `RESEND_FROM_EMAIL` (actual `EMAIL_FROM`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `infra/*.example`, `docs/RUNBOOK.md`, `infra/monitoring.md`                                                                                                                                                                                                                                                                                                                                                                       |
| X1  | —        | **Xendit provider readiness** — current API (`api-version: 2024-11-11`) requires `type:"PAY"`, `request_amount`, `channel_code`, `channel_properties`, optional `customer`, top-level response with `actions[].value`, statuses `ACCEPTING_PAYMENTS/SUCCEEDED/REQUIRES_ACTION/AUTHORIZED/CANCELED`, webhook `data.payment_id`/`payment_request_id`, and a provider refund port. **FIXED** (REVIEW-FIXES-4 P3): provider rewritten for the 2024-11-11 API; `XENDIT_MODE=test                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | live`is explicit, the matching API key selects the actual Xendit environment, Test Mode on production/staging requires a UAT email allowlist, and Test/Live circuit-breaker state is separated. **N1 (2026-08-19):** the provider`refund()`port is no longer invoked by`adminRefund` — admin refunds are in-app Marks credits only (`refundRecord.amountIdr = 0`, no `providerEventId`; PRD §677 Marks not convertible to rupiah) | `xendit-payment.provider.ts`, `payment.service.ts`, `admin-booking.service.ts`, `apps/server/src/webhooks/payments.ts`, `packages/env/src/server.ts` |
| X2  | —        | Resend: correct provider; missing `NODE_ENV=production` requirement on `RESEND_API_KEY` → silent stub suppresses all critical emails with no alert. **FIXED** (REVIEW-FIXES-4 P4.1 + prod-fixes C2): env schema superRefine requires `RESEND_API_KEY` when `NODE_ENV` is production/staging and rejects the dev-default `EMAIL_FROM` (must be a verified Resend address)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `packages/env/src/server.ts`                                                                                                                                                                                                                                                                                                                                                                                                      |
| X3  | —        | Google Meet: both auth paths correct; missing `GOOGLE_IMPERSONATED_USER` guard for SA mode (events land on the SA's own calendar), no boot-time probe, `.env.prod.example` broken. **FIXED** (REVIEW-FIXES-4 P4.2): env schema requires a complete credential set when `GOOGLE_MEET_ENABLED=true` (OAuth triple OR SA email+key) and `GOOGLE_IMPERSONATED_USER` in SA mode; boot-time `meeting.probe()` (calendarList.get) logs loudly on failure (wired into server bootstrap); `.env.prod.example` + `.env.staging.example` corrected. Also fixed `z.coerce.boolean()` coercing the string `"false"` to `true`                                                                                                                                                                                                                                                                                                                                    | `google-meeting.provider.ts`, `infra/.env.prod.example`, `packages/env/src/server.ts`                                                                                                                                                                                                                                                                                                                                             |
| X4  | —        | R2: the old manual presigned-POST flow was rejected by R2 with `501 NotImplemented` because R2 does not support multipart-form POST presigned URLs. **FIXED** (2026-09-01): R2 uses the AWS SDK presigned PUT flow with signed content type/length, and the upload bucket has browser CORS for the local and production app origins. The existing env guard still requires all four `R2_*` vars together AND `R2_PUBLIC_URL` in production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `storage.ts`, `packages/env/src/server.ts`, R2 bucket CORS policy                                                                                                                                                                                                                                                                                                                                                                 |
| X5  | —        | WhatsApp/SLA: no WhatsApp adapter (out of scope until approved); SLA business-hours WIB not implemented (H5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Redis Key Namespace Map

Redis keys follow the pattern `cogito:{namespace}:{key}`. **Redis is mandatory** (`REDIS_URL` is required in the env schema since #48); all stateful services use Redis for persistence. The in-memory implementations remain only as defensive fallback code when a configured Redis call fails at runtime.

| Namespace     | Key Pattern                | Used By          | TTL / Eviction               |
| ------------- | -------------------------- | ---------------- | ---------------------------- |
| `cogito:idem` | `{prefix}:{parts}`         | IdempotencyStore | 24h TTL (Redis EX)           |
| `cogito:rl`   | `{keyPrefix}:{identifier}` | rateLimit        | Window TTL (Redis EXPIRE)    |
| `cogito:cb`   | `{name}`                   | CircuitBreaker   | 2× resetTimeout (Redis HSET) |
| `cogito:sess` | Better Auth managed        | Session store    | 7 days (Better Auth config)  |

> `cogito:sess` is **reserved/unused** — Redis session caching is not implemented (Better Auth uses cookieCache + DB adapter; DEFERRED-OPS-TASKS §2).
> | `cogito-jobs` | BullMQ managed | Scheduler | Per-job repeat interval |

### In-Memory Fallback (defensive only)

Each stateful service (`IdempotencyStore`, `rateLimit`, `CircuitBreaker`) checks for Redis availability at runtime. If a configured Redis call fails, the service falls back to an in-memory implementation (with a warning log):

- **IdempotencyStore**: `Map<string, { result, timestamp }>` with periodic cleanup and max-entries eviction.
- **rateLimit**: `Map<string, { count, resetAt }>` with periodic cleanup and max-entries eviction.
- **CircuitBreaker**: In-memory `state`, `failureCount`, `lastFailureTime`, `halfOpenAttempts` fields.

Redis itself is mandatory (`REDIS_URL` is required); the fallback only keeps tests and degraded moments working, and only per-process.

### Adding Redis to a New Feature

1. Define your key pattern in `COGITO_NS` (in `packages/api/src/lib/redis.ts`).
2. Accept an optional `redis?: RedisClient` parameter in your service constructor.
3. Try Redis operations in a `try/catch`, falling back to in-memory on failure.
4. Test both paths: unit tests use `InMemoryRedis`, integration tests (if any) use real Redis.

## How to Add a New Module

Follow the 4-layer architecture: **Router → Handler → Service → Repository**.

### 1. Create the module directory

```
packages/api/src/modules/{module}/
├── {module}.types.ts    # Zod input/output schemas
├── {module}.errors.ts   # DomainError subclasses
├── {module}.repo.ts     # Data access (SQL queries only)
├── {module}.service.ts  # Business logic + consumer port interfaces
├── {module}.handler.ts  # DI factory: { context, input } → service calls
├── {module}.router.ts   # oRPC route definitions
└── index.ts             # createModule() factory function
```

### 2. Define types and errors

```ts
// {module}.types.ts
import { z } from "zod";
export const createSomethingInput = z.object({ name: z.string().min(1) });
export type CreateSomethingInput = z.infer<typeof createSomethingInput>;

// {module}.errors.ts
import { DomainError } from "../../lib/domain-errors";
export class SomethingNotFoundError extends DomainError {
  constructor(id: string) {
    super("SOMETHING_NOT_FOUND", `Something ${id} not found`);
  }
}
```

### 3. Create the repository

```ts
// {module}.repo.ts
import type { DbOrTx } from "../../lib/tx";
export interface SomethingRepo {
  findById(db: DbOrTx, id: string): Promise<Row | null>;
  create(db: DbOrTx, data: CreateData): Promise<Row>;
}
```

### 4. Create the service with consumer-driven ports

```ts
// {module}.service.ts
export function createSomethingService(deps: {
  repo: SomethingRepo;
  auditPort: AuditPort;     // Only the methods this module needs
  walletPort: WalletPort;   // Only the methods this module needs
}) { ... }
```

### 5. Create the handler

```ts
// {module}.handler.ts
export function createSomethingHandler(service: SomethingService) {
  return {
    create: async ({ context, input }) => { ... },
  };
}
```

### 6. Create the router

```ts
// {module}.router.ts
import { publicProcedure, protectedProcedure } from "../../procedures";
export const somethingRouter = {
  create: protectedProcedure.input(createSomethingInput).handler(...),
};
```

### 7. Wire into the composition root

Add to `packages/api/src/services.ts`:

- Import and call `createSomethingService({ repo, auditPort, walletPort })`
- Import and call `createSomethingHandler(service)`
- Add to `ServiceRegistry` type

Add to `packages/api/src/routers.ts`:

- Add `something: somethingRouter` to `appRouter`

### 8. Add DB schema and migration

In `packages/db/src/schema/`:

- Define the table with `pgTable`, checks, and indexes
- Export from `packages/db/src/schema/index.ts`
- Run `bun run db:generate` to create a migration

### 9. Add tests

Create `packages/api/src/tests/unit/{module}.service.test.ts` and `packages/api/src/tests/unit/{module}.handler.test.ts` with:

- Mock `DbOrTx` as `{ transaction: mock(async (fn) => fn(tx)) }` plus repo mocks
- Test each service method for happy path and error cases
- Test handler input validation and authorization

### Key Conventions

- **No `shared/ports/` directory** — ports are consumer-driven interfaces defined inline in the consuming service file.
- **`DbOrTx`** type from `packages/api/src/lib/tx.ts` — pass `db` for reads, `tx` inside transactions.
- **`ORPCError`** from `@orpc/server` for HTTP error responses.
- **`DomainError`** subclass for business logic errors — mapped in handlers via `withDomainMap()`.
- **Consumer-driven port interfaces** — each module declares only the methods it needs from other modules.
- **Redis integration** — optional `redis?: RedisClient` parameter with in-memory fallback.
- **Circuit breaker** — wrap external service calls (email, meeting) with `CircuitBreaker` from `../../lib/circuit-breaker`.

## Common Commands

```bash
bun install                # Install deps
bun run dev                # Dev all (web + server)
bun run dev:web            # Dev web only
bun run dev:server         # Dev server only
bun run db:start           # Start PostgreSQL Docker
bun run db:migrate         # Apply migrations
bun run db:generate        # Generate migrations
bun run db:studio          # Drizzle Studio
bun run check              # Oxlint + Oxfmt
bun run check-types        # TypeScript check (all workspaces)
bun run build              # Build server + web
bun run test               # Run tests
bun run test:coverage      # Run tests with coverage
```

### 2026-08-25 audit findings (tracked in `docs/plans/completed/BACKEND-PROD-FINALIZATION.md`)

Status: **all fixed and merged via #106 (2026-08-26)**; the follow-up re-audit findings (N1–N4, W1–W5) were fixed and merged via #107 (2026-08-26). Findings come from the two-worker audit (worker A: business-logic/data layer; worker B: server/ops/CI) plus lead re-verification.

| ID      | Severity | Finding                                                                                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | HIGH     | Seed package prices stale vs PRD OQ-01 (Starter 50/430k, Pioneer 300/2.18M — PRD: 50/312.5k, 400/2M)                                                                                                          | `0041_seed_mark_packages.sql` now installs/upserts the PRD catalog during normal migrations; seed-packages.ts/seed.ts/test-client remain aligned for local/test setup                                                                                                                                                                                                                                                     |
| F2      | HIGH     | `invite.claim` silently demotes an admin to tutor (no role guard; CONTEXT claimed a guard that didn't exist)                                                                                                  | `validateClaim` throws `InvalidRoleForClaimError` for admin accounts                                                                                                                                                                                                                                                                                                                                                      |
| F3      | HIGH     | `reconfirm` accept path skips re-reprice when headcount changed mid-cycle (PRD: recalculate + reissue)                                                                                                        | re-enters AWAITING_RECONFIRMATION + fresh 12h + reprice; survivors reset to `confirmed`                                                                                                                                                                                                                                                                                                                                   |
| F6      | MEDIUM   | `tutorAccept` meeting failure leaves CONFIRMED booking with stale deadline (expiry can fire while retry pending)                                                                                              | deadline bumped to `scheduledEndAt + 24h` on failure                                                                                                                                                                                                                                                                                                                                                                      |
| F7      | MEDIUM   | Outbox `claimPendingDispatches` OR-precedence could claim `sending` rows past the attempts budget                                                                                                             | predicate parenthesized + regression test                                                                                                                                                                                                                                                                                                                                                                                 |
| F8      | MEDIUM   | `markTutorAttendance` inserts a CONFIRMED tutor row that `findConfirmedParticipants` counts into group repricing                                                                                              | repo excludes `role='tutor'`                                                                                                                                                                                                                                                                                                                                                                                              |
| F9      | MEDIUM   | Lateness sweep filters `modality=online` — offline no-show tutors never flagged                                                                                                                               | filter removed (offline scheduled bookings flagged too)                                                                                                                                                                                                                                                                                                                                                                   |
| F10     | MEDIUM   | `setMeetingLink` writes the meetingEvent row on the global db, not the booking tx (orphan on rollback)                                                                                                        | `conn: DbOrTx` param threaded through providers                                                                                                                                                                                                                                                                                                                                                                           |
| F11     | MEDIUM   | `adminRefund` FIFO spend across ALL payments — can over-credit the wrong payment                                                                                                                              | per-payment FIFO attribution (`listCreditStatePaymentsForUser`), capped at availableBalance                                                                                                                                                                                                                                                                                                                               |
| F12     | MEDIUM   | Achievement `archived` status defined but unreachable (no archive/restore action)                                                                                                                             | `adminReview` supports archive + restore transitions                                                                                                                                                                                                                                                                                                                                                                      |
| F14     | MEDIUM   | `getTutorPayouts` unbounded query + N+1                                                                                                                                                                       | documented (pagination follow-up; payouts are admin-internal, low volume)                                                                                                                                                                                                                                                                                                                                                 |
| F15     | MEDIUM   | `invite.claim` doesn't require `emailVerified` (PRD: "after email ownership is verified")                                                                                                                     | documented as defense-in-depth — claim requires a valid session; OTP is the email-ownership proof at signup                                                                                                                                                                                                                                                                                                               |
| F16–F19 | LOW      | Role-scope drift: `searchStudents`/`achievement.*`/`payment.createPurchase` not student-scoped                                                                                                                | `studentProcedure`/`verifiedStudentProcedure` applied                                                                                                                                                                                                                                                                                                                                                                     |
| F22     | LOW      | `assignRoom`/`relocateRoom` insert roomBooking rows on wrong-state bookings                                                                                                                                   | `RoomBookingStateError` guard (awaiting approval + RESCHEDULE_PROPOSED carve-out)                                                                                                                                                                                                                                                                                                                                         |
| F24     | LOW      | `applyOverride` silently ignores non-participant `affectedParticipants`                                                                                                                                       | `OverrideParticipantNotInBookingError`                                                                                                                                                                                                                                                                                                                                                                                    |
| F25     | MEDIUM   | `reviewTutorProfile` has no per-status action state machine                                                                                                                                                   | `REVIEW_ACTION_TABLE` in `validateReviewAction`                                                                                                                                                                                                                                                                                                                                                                           |
| S1      | HIGH     | API-REFERENCE documents wrong RPC paths (`/rpc/tutor/booking/list` vs actual `/rpc/tutorActions/listBookings`; oRPC derives URLs from router keys)                                                            | API-REFERENCE corrected to the true paths                                                                                                                                                                                                                                                                                                                                                                                 |
| S2      | MEDIUM   | Sanity proxy streams unbounded upstream bytes (no size cap)                                                                                                                                                   | 5MB cap (content-length + streamed counter) + 10s timeout + host allowlist + 30/min rate limit                                                                                                                                                                                                                                                                                                                            |
| S4      | MEDIUM   | Auth rate limiter path prefixes miss better-auth's real endpoints (`/request-password-reset` and `/reset-password` have no trailing segment — password-reset brute force and OTP-email spam were unthrottled) | `matchAuthPath` now matches at segment boundaries (exact path or `prefix/`), covering `/sign-in/email`, `/request-password-reset`, `/reset-password`, `/change-email`, `/email-otp/*`                                                                                                                                                                                                                                     |
| S7      | MEDIUM   | `cd-prod.yml` deploy trigger: unset `COOLIFY_PROD_SERVER_WEBHOOK` secret → `curl` exit 6, image pushed but never deployed                                                                                     | **Fixed (#118)** — webhook secrets guarded (clear error + exit 1); `scripts/migrate-and-deploy.sh` polls `/health` until `version == GIT_SHA`; canonical Coolify host renamed to `cl.cogitoacademy.id` (2026-08-31, was `coolify.cogitoacademy.id` — the live host); operator must recreate the secrets with the resolvable `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...` URL (Option A, DEPLOYMENT-PLAN Task 0.2) |
| S14     | LOW      | CI coverage gate excludes `apps/server/src/` (except openapi.test.ts) — 100% claim covers a curated subset                                                                                                    | **report-only** — server suite runs in a separate process; coverage consolidation tracked in DEFERRED-OPS                                                                                                                                                                                                                                                                                                                 |

## Tutor weekly honorarium and payout account (2026-08-28)

Tutor-facing financial UI uses IDR only; internal/student Marks values are not presented to tutors. The tutor dashboard shows completed-session honorarium awaiting admin payment, not a calendar-reset total. Admin-confirmed payout records advance an exclusive cutoff so the pending amount clears only after payment. Tutor profiles store private payout bank details: bank name, account number, account-holder name, account-opening city/regency, ownership choice, and transfer-responsibility acknowledgment. Only the exact bank name `BCA` is fee-free, representing conventional BCA; BCA Syariah, `blu` (BCA Digital), and every other bank name incur a Rp2,500 deduction once per payout. The public tutor discovery projection omits all payout fields.
