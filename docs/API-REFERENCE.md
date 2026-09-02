# Cogito API Reference

Last updated: 2026-09-02

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

All roles use Better Auth `user.name` as the canonical visible name. Tutor
onboarding saves its single **Name** field through Better Auth and no longer
sends tutor-profile `displayName`; discovery keeps its compatible
`displayName` response key but projects that value from `user.name`. The legacy
tutor-profile input/column remains accepted for compatibility and is not used by
new web UI.

## Tutor profile drawers (2026-08-31)

The student tutor-discovery drawer and admin tutor-review drawer keep their header/action regions outside the scroll container while `Drawer.Content` owns the single vertical scroll region for long profile content. The body may overscroll locally, but that motion is contained and cannot move the fixed regions. This is client-side presentation only; no RPC path, request envelope, response shape, schema, or persistence contract changed.

## Stable collection transitions (2026-08-28)

Pagination and filter-transition stability is client-side only. The admin tutor
tables, tutor discovery list, and admin booking queue retain their previous
successful collection while the next query is loading; pagination scrolls to
the selected table card by DOM ID. No RPC path, request envelope, response
shape, cursor/offset contract, or URL search parameter changes.

Booking-list UI note: `/bookings` uses Needs action, Upcoming, Recurring, History, and All tabs. Students and tutors default to Needs action when a response is pending and Upcoming otherwise; admins default to All. URL-backed Recommended, Soonest, and Latest sorting is client-side; Recommended ranks pending, active, then terminal bookings, and History consolidates terminal outcomes. The web list consumes the existing `nextCursor` in batches of 20 through an infinite query and appends with **Load more bookings**; loaded cards remain visible during the next-page request. Tab counts are lower bounds and show `+` while more pages remain. The RPC contract is unchanged.

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

Email/password sign-in and sign-up use Better Auth endpoints under `/api/auth`. The server's sign-up password-policy preflight returns 400 for malformed JSON instead of allowing a parser exception to become a 500. The web client validates the email forms on the client and surfaces invalid fields with Selia's inline error state and danger outline, waits for the successful auth response and a fresh session read before entering an authenticated route, and the authenticated route guard also reads the non-cookie-cached session so role-based redirects do not briefly fall back to `/login`. If that fresh session has `emailVerified !== true`, the web client requests an email-verification OTP and routes the user to `/verify-email` before the normal role/return-path destination; this also covers legacy accounts created before verification was introduced. The validated destination is preserved after verification. This changes no successful request or response shape.

Google sign-in starts through Better Auth on the API and uses `GET /api/auth/callback/google` as the provider callback (`BETTER_AUTH_URL`), then redirects the browser to the frontend callback route supplied by the web client (`https://app.cogitoacademy.id/auth/callback`). The Google provider explicitly sends `prompt=consent`, so the Google OAuth permission screen is shown even when the account has authorized the client before. Sign-in requests Google's identity scopes only; the broader Calendar scope used by the server-side Meet integration remains a separate operator OAuth flow. In production, session cookies remain `SameSite=Strict`; Better Auth's short-lived signed OAuth state cookie is scoped to `SameSite=Lax` so a top-level `GET` callback from Google can return it for state verification. The state cookie remains `Secure`/`HttpOnly`, and the database-backed state record plus signed cookie must both validate before a session is created. This changes no endpoint input or output shape.

Production and staging server bootstrap also reconcile `ADMIN_EMAILS` before
serving traffic (default: `itcogitoacademy01@gmail.com`). Matching addresses
are compared case-insensitively and promoted to `admin`; existing admins are
never demoted. A matching account created after boot is promoted by the Better
Auth signup hook. This is operational role initialization, not a new RPC or
auth request/response field; other admins can still be managed through the
existing admin role-management flow.

The web dashboard mostly composes existing procedures: the shared booking list uses protected `booking.listMine` for student, tutor, and admin visibility (with admin seeing all bookings), while tutor discovery remains student-only (`tutors.listPublished`) and tutor/admin dashboards compose their remaining role-specific procedures. The admin dashboard's Business insights section additionally calls the admin-only `admin.getDashboardAnalytics` aggregate procedure for 7/30/90-day WIB metrics and a live booking-state portfolio. Student and tutor next-lesson sections derive the nearest future non-terminal, non-pending item client-side and reuse the booking-list card; the tutor dashboard's above-the-fold ordering of welcome/setup, review requests, and next lesson is presentation-only. Student and tutor welcome cards also share one frontend visual component with role-specific copy and links. On narrow screens, the rounded booking status-tab strip fills the available page width and only its inner tab list scrolls horizontally inside a scrollbar-hidden region; internal paint padding keeps selected-tab shadows and focus rings visible, while shared empty-state cards preserve their rounded glow and card shadow without widening the page. These are presentation-only details except for the documented admin analytics read.

The authenticated `/guide` (`How Cogito Works`) route is frontend-only. Its typed journey content is bundled with the web app, is role-filtered in the route UI, and adds no RPC procedure, request input, response output, or persistence contract. The centered `max-w-6xl` shell, Selia-composed chapter rail, and bold timing callouts are presentation-only; the callouts restate existing 7-day, 12-hour, H-2, 15-minute, 24-hour, meeting-retry, and support-SLA rules. The development-only anti-slop Tweaks Bar is a static browser asset and does not change the production API surface.

The global route pending loader is also presentation-only. It composes the local Selia `Spinner` with a token-based loading ring and label for route, onboarding, and auth loading states, adding no RPC procedure, request input, response output, or persistence contract.

The authenticated shell's Light/Dark/System theme menu and its `D` keyboard shortcut are frontend-only. Pressing `D` outside editable fields toggles the rendered light/dark mode through `next-themes`; it adds no RPC procedure, request input, response output, or persistence contract.

The shared empty-state presentation is also frontend-only. Empty collections, filtered no-match results, and embedded no-data sections are rendered by `apps/web/src/components/empty-state.tsx` with density and tone variants; this changes no RPC procedure, request input, response output, or persistence contract.

The browser-native control refactor is presentation-only: Selia `Textarea`, `NumberField`, `DatePicker`, and minute-level time controls do not add or change an RPC procedure, input schema, output shape, or persistence contract. Shared text-entry controls use an explicit 16px font size below the `lg` breakpoint to prevent mobile focus zoom, then use the tokenized `text-base` size from `lg` upward. The availability range separator is visual only; time suggestions may render wider than their compact input, and modality triggers preserve their icon-label row without changing the weekly range payload. Portal-based date and select popups render above dialog layers so modal forms remain interactive.

## Authenticated Editorial Content (`content.*`)

Sanity is queried only by the API server. The browser receives normalized content through protected procedures; Knowledge Bank asset URLs are intentionally omitted from list responses.

### `content.listCompetitions`

- **Auth:** Protected
- **Input:** None
- **Output:** `[{ id, title, description, location, categories: [{ id, name, coreCategory }], educationLevels, startDate, endDate, scale, organizer, registrationDeadline, registrationLink, socialMediaLink }]`
- **Description:** Returns published competition calendar entries with English projections for every authenticated role. The app route is `GET /calendar` in the SPA; the read-only UI presents the data in month and 30-day agenda views and opens a responsive details modal without changing this API contract. The route uses a contained viewport layout so the calendar body handles vertical scrolling and the month grid handles horizontal scrolling.

### `content.listStudentResources`

- **Auth:** Protected (student, tutor, or admin)
- **Input:** None
- **Output:** `{ items: [{ id, title, description, category }], access: { eligible, balance, threshold } }`
- **Description:** Returns published Knowledge Bank metadata for the authenticated `/knowledge-bank` app route. Students must meet the 35-Mark total-balance threshold (held Marks count toward eligibility); below the threshold, `items` is empty and the access state explains the lock. Tutors and admins are eligible regardless of wallet balance.

### `GET /content/knowledge-bank/:resourceId/file`

- **Auth:** Student with current total balance at or above the threshold, Tutor, or Admin
- **Input:** `resourceId` path parameter
- **Output:** Streamed Sanity file, normally `application/pdf`
- **Description:** Revalidates the student/tutor/admin role and Knowledge Bank eligibility, resolves the asset server-side, and streams it with `Cache-Control: private, no-store`. Tutors and admins bypass the student wallet threshold. This is an Elysia file route, not an oRPC procedure.

### Verification

CI runs the API integration/unit suite together with the env, auth, and database package tests. The coverage gate requires 100% coverage for `packages/api` lines, overall lines, functions, and branches; a file set with no instrumented branches is reported as 100% for that metric. Coverage is reported from the same lcov artifact used by `.github/scripts/coverage-comment.ts`.

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

---

## Admin (`admin.*`)

### `admin.getDashboardAnalytics`

- **Auth:** Admin
- **Input:** `{ period?: "7d" | "30d" | "90d" }` (default `"30d"`)
- **Output:** `{ period, periodStart, periodEnd, summary, bookingTrend, userTrend, stateBreakdown, modalityBreakdown, categoryBreakdown }`
- **Description:** Returns the aggregate data used by the admin Business insights section. Period metrics use booking/user creation time and WIB calendar days; `summary` includes booking volume, resolved-booking completion rate, active learners, new students/tutors, gross Marks, and platform-take Marks. `stateBreakdown` is the live all-bookings state mix, while modality/category breakdowns are scoped to the selected period. Missing trend days are returned as zero rows so charts stay continuous.

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
- **Description:** Case-insensitive partial lookup for admin support workflows. Matches `name`, `email`, or `id`; exact email/ID matches are ranked first. Wildcard characters are treated literally. The wallet lookup UI uses the selected result's `id` with `admin.getWallet` and `admin.listLedgerEntries`.

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
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (`tutorPayoutIdr` is summed from IDR tutor-honorarium snapshots; legacy pre-economy bookings use the compatibility path)
- **Errors:** `INVALID_LEDGER_FILTER` (400) — invalid date
- **Description:** Internal tutor payout reporting from completed bookings in the requested date range. With no date filters this is an all-time report; use `admin.getPendingTutorPayouts` for the unpaid amount after the latest admin-paid cutoff. `totalMarks` reports the internal split basis (`priceSnapshot.baseline`), so `totalMarks === cogitoTake + tutorPayout`; per-student rounding surpluses (`actualMarksPooled ≥ baseline`) are not included.

### `admin.getPendingTutorPayouts`

- **Auth:** Admin
- **Input:** `{ tutorId }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr, lastPaidAt }`
- **Description:** Returns the unpaid tutor honorarium since the latest admin-paid cutoff. The cutoff advances only when `admin.markTutorPayoutPaid` succeeds; no calendar-week reset is applied.

### `admin.markTutorPayoutPaid`

- **Auth:** Admin
- **Input:** `{ tutorId }`
- **Output:** `{ id, tutorId, grossHonorariumIdr, transferFeeIdr, netHonorariumIdr, bankName, paidAt }`
- **Errors:** `TUTOR_PAYOUT_NOT_AVAILABLE` (400) when no unpaid honorarium exists or payout account details are incomplete
- **Description:** Atomically records an immutable paid payout at the current completion-time cutoff. Exact conventional `BCA` has no transfer fee; all other bank names deduct Rp2,500 once from the payout. The application records the payment and audit trail but does not execute the bank transfer.

### `admin.getEconomySettings`

- **Auth:** Admin
- **Input:** None
- **Output:** `{ id, markValueIdr, minTutorBaseRateIdr, onlineTutorIncrementIdr, offlineTutorIncrementIdr, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr, version, updatedBy, createdAt, updatedAt }`
- **Description:** Returns the active Marks computational value and the online/offline tutor and Cogito schedules used for new booking snapshots.

### `admin.updateEconomySettings`

- **Auth:** Admin
- **Input:** `{ expectedVersion, onlineCogitoBaseIdr, onlineCogitoIncrementIdr, offlineCogitoBaseIdr, offlineCogitoIncrementIdr }` (IDR values use Rp 5,000 increments; bases are at least Rp 5,000; increments are non-negative)
- **Output:** The updated economy settings object; `version` increments only when at least one schedule value changes
- **Errors:** `ECONOMY_CONFIG_CONFLICT` (409) when `expectedVersion` is stale; validation errors (400) for unsupported values
- **Description:** Updates the active Cogito take schedule, records an audit event, and affects only future bookings and new repricing snapshots. Existing booking snapshots remain unchanged. Every user currently assigned the `tutor` role receives one durable in-app `system` notification per new economy version; the notification is deduplicated by version and tutor id. Saving identical values is a no-op and creates no new audit event or notification.

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
- **Description:** The admin review UI resolves pending `subjectIds` through the active subject taxonomy and displays category/subject labels; the procedure continues to return the pending change payload unchanged.

### `adminTutor.listTutorProfileHistory`

- **Auth:** Admin
- **Input:** `{ tutorProfileId }`
- **Output:** Up to 50 newest audit entries for the tutor profile, including action, actor, timestamps, state snapshots, and photo workflow details
- **Description:** Returns the review/photo history shown in the admin tutor drawer. Admin-uploaded edited assets are applied to the canonical `user.image` only by an approve/publish action; requesting changes never changes the current public photo.

### `adminTutor.reviewTutorProfile`

- **Auth:** Admin
- **Input:** `{ tutorProfileId, action, adminNote?, profileImageUrl? }` (`action` one of request_changes/approve_unpublished/publish/unpublish/suspend/approve_edits/request_edit_changes; `profileImageUrl`, when present, must be an HTTP(S) URL or a generated `/uploads/...` storage path of at most 2048 characters)
- **Output:** `{ profile }`
- **Errors:** `TUTOR_PROFILE_NOT_FOUND` (404), `INVALID_INVITE_ACTION` (400) when the action is not allowed from the profile's current onboarding status (F25 state machine: publish only from `pending_review`/`changes_requested`/`approved_unpublished`; unpublish/suspend/approve_edits/request_edit_changes only from `published`; request_changes only from `pending_review`/`changes_requested`), `TUTOR_PROFILE_OPTIMISTIC_LOCK` (409) if another moderator changed the profile first

### `adminTutor.updateTutorAchievements`

- **RPC path:** `/rpc/adminTutor/updateTutorAchievements`
- **Auth:** Admin
- **Input:** `{ tutorProfileId, version, education, competitionAchievements }`; `education` accepts up to 2 `{ university, degree }` entries and `competitionAchievements` accepts up to 5 `{ competitionName, year, awards }` entries, with awards as one or more full titles
- **Output:** Updated `TutorProfile` row
- **Errors:** `TUTOR_PROFILE_NOT_FOUND` (404), `OPTIMISTIC_LOCK` (409) when `version` no longer matches
- **Description:** Lets an admin normalize education and competition copy during profile review. The update increments the profile version, records an audit event, and mirrors matching pending achievement fields when a published tutor has a pending edit proposal.

---

## Tutor (`tutor.*`)

### `tutor.getMyProfile`

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Description:** Returns the authenticated tutor's profile. The web app presents this tutor-owned profile editor at `/profile`; the legacy `/onboarding` URL redirects there. This route change does not alter the RPC contract.

### `tutor.getMyProfileHistory`

- **Auth:** Tutor
- **Input:** None
- **Output:** Up to 50 newest audit entries for the authenticated tutor profile, including action, actor identity (`id` and display name only), actor type, timestamps, and photo/review workflow details; account email is not returned
- **Description:** Returns the profile history shown to the tutor. Published photo replacements remain proposals until an admin approves them.

### `tutor.updateMyProfile`

- **Auth:** Tutor
- **Input:** `{ version, displayName? (legacy clients only), shortBio? (maximum 50 whitespace-delimited words and 2,000 characters), credentialsSummary?, achievements?, experiences?, achievementProofUrls?, experienceProofUrls?, profileImageUrl?, education?, competitionAchievements?, experienceEntries?, expertise?, subjectIds?, modality?, baseRatesIdr?, bankName?, bankAccountNumber?, bankAccountHolderName?, bankAccountOpeningCity?, bankAccountOwnership?: "self" | "trusted_person", bankTransferDisclaimerAccepted?, prices? }`; `experienceEntries` accepts up to 5 `{ role, organization, startYear, endYear, description }` entries, with `endYear` nullable for an ongoing role. The tutor editor saves its canonical name through Better Auth, exposes one combined structured Achievements & experience section and one profile-image field, and does not send `displayName`. The legacy `achievements`/`credentialsSummary`/`experiences` values remain accepted for older profiles.
- **Output:** `{ profile, subjects: [{ id, slug, name, description?, isSelectable, parent: { id, slug, name } }] }`
- **Errors:** `OPTIMISTIC_LOCK` (409) on version mismatch, `INVALID_TUTOR_PRICING` (400) on floor-price violation, `INVALID_TUTOR_SUBJECT_SELECTION` (400) when ids are not active selectable child subjects or exceed 7; tutor domain validation errors include field-specific data such as `missingFields`, `pricingError`, or `subjectIds` where available
- **Description:** Updates the tutor profile with optimistic locking. The tutor editor presents one combined structured Achievements & experience section and one profile-image field; each experience stores a role, organization, start/end years, and a brief description. Short bios are limited to 50 whitespace-delimited words (and 2,000 characters). Year values are sent as plain integers without grouping punctuation, and an end year must be on or after its start year. Comma punctuation in award and experience text remains visible while editing; comma-separated award titles still normalize to the structured `awards` array. Legacy `achievements`/`credentialsSummary`/`experiences` text remains readable as a fallback when no structured entries exist. `achievementProofUrls` and `experienceProofUrls` accept bounded HTTP(S) URLs; `profileImageUrl` accepts bounded HTTP(S) URLs or a generated local `/uploads/...` storage path. The tutor-facing proof guidance recommends putting both achievement and experience evidence in one Google Drive folder with the “Anyone with the link can view” setting. `profileImageUrl` is the single canonical tutor profile image: draft/changes-requested updates write it to the account image, while published changes wait in `pendingProfileChanges` until admin review. The admin can replace it with the background-standardized final asset through tutor review. `subjectIds` is the normalized child-category selection. Payout-account fields remain private. A published tutor's `baseRatesIdr` takes effect immediately for future bookings; existing bookings retain their stored price snapshot for payout. Other trust-sensitive changes—including structured achievements and experiences—wait in `pendingProfileChanges`. The web editor exposes separate **Save draft**/**Save profile changes** and **Submit for review** actions: saving permits incomplete required top-level fields while still highlighting malformed values, while submission applies the complete required-field gate. Both client-side and API-side validation errors are shown beside the affected field and in the form summary.

Structured tutor experience fields are submitted through `experienceEntries` as up to five `{ role, organization, startYear, endYear, description }` entries. Years are plain integers; `endYear` may be `null` for an ongoing role and cannot precede `startYear`. Legacy `experiences` text remains accepted for older profiles.

### `tutor.submitForReview`

The web tutor profile editor groups education, competition achievements, and experiences into one combined **Achievements & experience** section with one public preview; the API fields and review behavior remain unchanged.

- **Auth:** Tutor
- **Input:** None
- **Output:** `{ profile }`
- **Errors:** `TUTOR_PROFILE_INCOMPLETE` (400) when required profile fields are missing; `INVALID_TUTOR_PRICING` (400) when a base honorarium is invalid; `INVALID_TUTOR_SUBJECT_SELECTION` (400) when subject ids are invalid
- **Description:** Submits a draft profile for admin review. The required achievement may come from the structured competition-achievement entries or from legacy achievement text retained on an older profile. The required experience may come from `experienceEntries` or legacy experience text retained on an older profile. Incomplete and pricing errors include their missing-field or pricing detail so the web form can highlight the relevant controls.

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
- **Description:** Atomically deactivates future recurring windows from `effectiveFrom` and regenerates them from weekly hours. One-off date overrides are preserved and take priority over conflicting generated occurrences.

### `tutor.deleteAvailability`

- **Auth:** Tutor
- **Input:** `{ id }`
- **Output:** None (void)
- **Description:** Deactivates (soft-deletes) an availability slot

### `tutor.getMyPayouts`

- **Auth:** Tutor
- **Input:** `{ dateFrom?, dateTo? }`
- **Output:** `{ completedSessions, totalMarks, cogitoTake, tutorPayout, tutorPayoutIdr }` (internal split fields remain for compatibility; the tutor UI renders only `tutorPayoutIdr`)
- **Errors:** `INVALID_DATE_RANGE` (400)
- **Description:** The authenticated tutor's unpaid honorarium summary. With no date filters, completed sessions are selected after the latest admin-paid cutoff; the cutoff advances only when an admin records a payout. Weekly processing is an operational cadence, not an automatic Monday reset.

---

## Tutor Discovery (`tutors.*`)

### `tutors.listSubjects`

- **Auth:** Public
- **Input:** None
- **Output:** `{ items: [{ id, slug, name, description?, children: [{ id, slug, name, description? }] }] }`
- **Description:** Returns the seven active competition categories and their 33 selectable child subjects used by tutor onboarding and student filters. The UIs submit child/category IDs for persistence or filtering but display category and subject names to users.

### `tutors.listPublished`

- **Auth:** Student
- **Input:** `{ search?, expertise?, categoryId?, subjectId?, categoryIds?, subjectIds?, modality?, limit?, offset? }` (`limit` default 20, max 50)
- **Output:** `{ items: TutorProfile[] }`; each profile includes `education`, `competitionAchievements`, `subjects: [{ id, slug, name, description?, isSelectable, parent }]`, and computed `pricesByModality.online/offline` Marks maps when the profile has IDR base honoraria
- **Description:** `categoryId`/`subjectId` remain supported for single-value clients. `categoryIds` and `subjectIds` accept up to 50 unique values and match any selected value within that facet; when both facets are present, the same normalized child-subject relation must satisfy the selected parent and child constraints. Search matches normalized child subject names as well as legacy profile text; no matching normalized relation returns an empty `items` array. Structured education and competition achievements are returned in their normalized arrays; older profiles may still rely on `credentialsSummary`. Marks prices are derived from the active economy config; tutor IDR base honoraria are not exposed in this student response. The frontend may render the returned modality maps as one group-size matrix with separate Online and Offline columns, prefixing populated values with the Cogito Marks icon; this does not alter the RPC contract.

### `tutors.getProfile`

- **Auth:** Student
- **Input:** `{ tutorId }`
- **Output:** `{ profile }` with computed `pricesByModality` Marks maps
- **Description:** Returns the published tutor profile and future availability slots for the booking form, including structured education and competition achievements. Marks prices use the active economy config for new IDR profiles; legacy profiles continue to return their stored Marks map.

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
- **Input:** None
- **Output:** `{ items: Achievement[] }`
- **Description:** The student `/achievements` page consumes this unchanged list and presents a compact horizontally scrollable table; full metadata and pending edit/delete actions are available in a frontend-only detail drawer.

### `achievement.create`

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
- **Input:** `{ status?, limit?, offset? }` (`limit` default 50)
- **Output:** `{ items: Achievement[], total, limit, offset }`
- **Description:** The admin `/admin-achievements` page consumes this unchanged paginated list and presents submissions in a compact horizontally scrollable moderation table; full metadata and approve/reject/correct actions are available in a frontend-only detail drawer, while the mutations remain separate RPC calls.

### `achievement.adminUpdate`

- **RPC path:** `/rpc/admin/achievements/update`
- **Auth:** Admin
- **Input:** `{ id, version, data: { eventName?, category?, award?, level?, issuer?, visibility?, awardingDate?, location?, description?, subjects?, evidenceUrl?, documentationUrl? } }`; nullable optional fields can be cleared
- **Output:** `{ achievement }`
- **Description:** Corrects a pending or legacy `pending_review` achievement before moderation. Admins can correct the submission fields and set or clear the public documentation image. The update uses optimistic compare-and-swap via `version`, records an `achievement_admin_updated` audit event with before/after content, and leaves the status unchanged so approval/rejection remains a separate action. A stale version returns `OPTIMISTIC_LOCK` (409); non-pending records return `ACHIEVEMENT_NOT_EDITABLE`.

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
- **Output:** `MarkPackage[]`
- **Description:** Returns active purchasable mark packages. The default catalog is installed automatically by versioned database migration `0041_seed_mark_packages.sql`; values are Starter Pack 50 Marks / Rp 312,500; Learner Pack 120 Marks / Rp 690,000; Explorer Pack 200 Marks / Rp 1,070,000; Pioneer Pack 400 Marks / Rp 2,000,000. Admins can manage later catalog changes through `adminMarkPackage.*`.

### `wallet.knowledgeBankEligible`

- **Auth:** Protected (student, tutor, or admin)
- **Input:** None
- **Output:** `{ eligible, balance, threshold }`
- **Description:** Checks Knowledge Bank access without changing the wallet. Students must meet the 35-Mark threshold, and eligibility plus `balance` use the **total balance** (held Marks count, per PRD DL-16 / U13). Tutors and admins are eligible regardless of wallet balance; `balance` is still returned when a wallet exists and is `0` when no wallet exists. No Marks are deducted.

> Note: `hold`/`release`/`deduct`/`credit`/`compensate` are service-layer methods only — they are not exposed over RPC; other modules call them via consumer-driven ports.

---

## Payment (`payment.*`)

### `payment.createPurchase`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role **and** `emailVerified: true`; unverified students get `FORBIDDEN` "Email verification required")
- **Input:** `{ packageCode }`
- **Output:** `{ paymentId, providerReference, checkoutUrl }`
- **Errors:** `PACKAGE_NOT_FOUND` (404), `PACKAGE_ALREADY_PURCHASED` (409), `PAYMENT_TEST_MODE_RESTRICTED` (403), `PAYMENT_PROVIDER_ERROR` (502)
- **Description:** Creates a purchase intent with the payment provider (reuses a pending intent; resets FAILED/EXPIRED payments to PENDING and re-creates the checkout — re-purchase, #46); on success the webhook credits the wallet

### Xendit environment selection

- `PAYMENT_PROVIDER=xendit` selects the Xendit provider. `XENDIT_MODE` is required and must be `test` or `live`; the Xendit API key, created in the matching Xendit Dashboard mode, selects the actual transaction environment. `XENDIT_MODE` is not sent as an API field.
- In production/staging, `XENDIT_MODE=test` also requires `XENDIT_TEST_ALLOWED_EMAILS`; only those verified student emails can call `payment.createPurchase`. This keeps production-domain UAT from granting sandbox-funded Marks to arbitrary accounts.
- Test and live webhooks use the same endpoint path, but must be configured in the matching Xendit Dashboard mode and must use that mode's `x-callback-token`.

### `payment.getPurchase`

- **Auth:** Protected
- **Input:** `{ paymentId }`
- **Output:** `{ id, status, provider, providerReference, amountIdr, marks, receiptUrl, failureReason, createdAt }`
- **Errors:** `PAYMENT_NOT_FOUND` (404)
- **Description:** Returns the payment record if owned by the requesting user

### `POST /webhooks/payments/:provider` (external)

- **Auth:** Public (non-oRPC route)
- **Input:** Raw body; headers `x-callback-token` (xendit) / `x-webhook-signature`, `x-timestamp` (timestamp validation is **skipped for xendit** — the API documents only `x-callback-token`, P3.5/L4)
- **Output:** `{ ok: true }`
- **Errors:** 401 signature failure, 408 stale timestamp (> 5 min, non-xendit), 403 IP not allowlisted, 500 processing failure
- **Description:** Provider webhook; verifies signature, validates timestamp (provider-conditional), then atomically claims the idempotency key (released on transient processing failure), calls `payment.confirmFromWebhook`, and updates payment status (`PENDING → PAID/SETTLED/FAILED/EXPIRED`; `PAID/SETTLED → REFUNDED`); credits the wallet on PAID/SETTLED and writes the payment notification (#46). Xendit lifecycle keys combine provider, `data.payment_id ?? data.payment_request_id`, and normalized status because 2024-11-11 webhooks carry no unique `event_id`: distinct lifecycle states for one payment are processed, while retries of the same state dedupe. A missing event id falls back to the provider reference rather than a shared placeholder. On re-purchase after FAILED/EXPIRED the `providerRequestId` is rotated to the new attempt while the previous `providerEventId` is retained as a stale-generation marker: a late FAILED/EXPIRED webhook for the OLD attempt is ignored so it cannot flip the re-purchased PENDING row terminal and strand the new purchase's credit (H3, wave-6b). A REFUNDED webhook reads the wallet through the transaction (`wallet.getByUserId(tx, ...)`, N4) and reverses the credited Marks from the **total balance** (`held + available`): held Marks are released back to available (`refund.{id}.release`) then the full payment Marks are reversed via `compensate_deduct` (`refund.{id}.reverse`) when total ≥ marks; if the Marks were already spent (`totalBalance < marks`, H4), the payment is still marked REFUNDED and a `refund_webhook_reconciliation` audit + `refund_record` row are written for admin (no reversal, no throw, no 500/retry loop — P2.7/H4, M1/N4 wave-6b)

### Provider refunds (X1, P3.6 — superseded by N1, 2026-08-19)

- ~~`adminRefund` initiates a provider-side refund via the active provider's `refund(paymentRequestId, amountIdr, reason?)` — Xendit `POST /v3/refunds` (`{payment_request_id, currency, amount, reason}` → `{id}`), stub returns `rfd-stub-{paymentRequestId}`. The provider refund is **best-effort**: a provider failure is logged and never rolls back the Marks reversal. The returned refund id is stored on `refund_record.provider_event_id`.~~ **REMOVED (N1):** `adminRefund` no longer calls the payment provider at all — admin refunds are in-app Marks credits only (PRD §677: purchased Marks are never convertible back to rupiah). `refund_record.amount_idr` is `0` and `provider_event_id` is `NULL` for admin refunds. The provider `refund()` port (Xendit `POST /v3/refunds`, migration 0025 `payment_record.provider_request_id`) remains on the provider/payment service for a future payment-error-only cash-refund flow, but `adminRefund` must never invoke it.

---

## Booking (`booking.*`)

### `booking.createSolo`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, scheduledStartAt, timezone?, learningGoal }` (`subjectId` selects one active subcategory offered by the tutor and is snapshotted as the session topic; legacy callers may omit it and the sole tutor topic is selected automatically; `learningGoal` carries Session Notes and accepts up to 2,000 characters including reference links; duration is server-fixed to 90 minutes)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400), `BOOKING_CONFLICT` (409), `INSUFFICIENT_MARKS` (400)
- **Description:** Creates a solo booking and holds Marks; idempotency via `idempotency-key` header

### `booking.get`

- **Auth:** Protected
- **Input:** `{ bookingId }`
- **Output:** `{ booking, participants, history, meetingStatus, meetingUrl }` — access-checked for the proposer, tutor, participants, or admin; participant/tutor/proposer user objects are limited to `id`, `name`, `image`, and `role` (never account email), and history entries include `fromState`, `toState`, `actorType`, `reason`, and `createdAt`
- **Errors:** `BOOKING_NOT_FOUND` (404)
- **Description:** `meetingStatus` is `ready` only when a URL exists, `pending` while the booking is awaiting the tutor/participants or a tutor/admin fallback link, and `failed` when automatic Google Meet creation needs another retry. If tutor acceptance encounters a provider failure, the booking remains `confirmed` until retry or manual-link recovery; clients must not treat that state as `scheduled`.
- **Frontend note:** Booking activity presents the destination state as the primary badge and uses transition-specific icons for participant, scheduling, room, and terminal events. The detail page composes schedule, format/access, and participant profile/name/status information in the overview, places role-appropriate primary actions (including reschedule and completion when eligible) directly below the status badge, keeps contextual actions above Marks or in the main flow, and shows a live response-window notice for deadline-bound states. The API contract is unchanged.

**UI behavior note:** The booking detail surface uses compact accessible Selia `IconInfoSquareRounded` popover triggers for online-link explanations, retry/manual setup status, available meeting-room access, missing offline-room details, and tutor completion timing. Available links no longer render a `Ready` badge or standalone CTA; the popover contains the meeting-room action. The trigger supports hover, keyboard focus, click, and touch; the overview merges the date and hours into one `Date & time` field, places Format & access beside it in a responsive two-column grid that stacks on narrow screens, and keeps the desktop overview/activity flow independent from the sticky Actions/Marks rail so rail height does not add a blank row before Activity. Narrow layouts keep actions/Marks before Activity. This does not change the `booking.get` response contract.

### `booking.listMine`

**Frontend title parity:** Booking list rows and the booking-detail header use
the same presentation formatter as Calendar/Meet:
`Cogito - {Competition} | {Tutor} x {Student}`, with `& Friends` for
group/group-series bookings. This does not add a response field or change the
RPC contract.

- **Auth:** Protected
- **Input:** `{ cursor?, limit?, states? }`
- **Output:** `{ items: Booking[], nextCursor }`
- **Description:** Shared role-aware booking list. Students see bookings where they are proposer or participant, tutors see bookings assigned to them, and admins see all bookings. `states` can narrow the result for server-side consumers; the web list requests 20 items at a time, follows `nextCursor` for **Load more bookings**, and applies its Upcoming/Pending/Recurring/Past/Cancelled/All presentation filters client-side, defaults to Upcoming for students, Pending for tutors with pending requests (otherwise Upcoming), and All for admins, unless an explicit `tab` query parameter is present. It sorts Upcoming/Pending/Recurring/All by nearest scheduled start, while Past/Cancelled remain newest-first. Related user projections contain display identity only (`id`, `name`, `image`, `role`); internal meeting attendee email arrays are never part of this response. The web row presents Marks with the Cogito mark icon and keeps status explanations in the status-badge tooltip. On narrow screens, the rounded status-tab strip stays within the available page width while only its inner tab list scrolls horizontally without showing a native scrollbar; internal paint padding keeps selected-tab shadows and focus rings visible, and shared empty-state cards keep their rounded glow and card shadow visible without widening the page. Dashboards reuse the same read model for their next-lesson card; no dashboard-specific endpoint is required.

### `booking.cancel`

- **Auth:** Student
- **Input:** `{ bookingId, cancellationReason? }`
- **Output:** `{ booking }`
- **Description:** Cancels a booking before its scheduled start. A cancellation within H-2 becomes `late_cancelled` and forfeits held Marks; at or after `scheduledStartAt`, the procedure rejects with `BOOKING_CANCELLATION_DEADLINE_PASSED` so the live booking remains available for tutor completion. Session-delivery or attendance problems after start go through support/admin review.

### `booking.acceptReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Records one acceptance on the active, unexpired proposal. Partial acceptance does not change the schedule; before unanimous tutor + active-student acceptance applies the proposed 90-minute time, the server serializes the booking/tutor decision and rechecks tutor overlap plus series-session ownership/state/sibling overlap. A stale, expired, or newly conflicting target is rejected without changing the schedule. Successful acceptance restores the booking state that was active before the proposal. For an offline booking-level proposal, the active room assignment is moved with the booking when available; a room conflict or missing assignment returns the booking to `awaiting_admin_room_approval`.

### `booking.getRescheduleAvailability`

- **RPC path:** `/rpc/booking/getRescheduleAvailability`
- **Auth:** Protected; booking tutor, proposer, or participant
- **Input:** `{ bookingId }`
- **Output:** `AvailabilitySlot[]`
- **Description:** Returns active tutor availability for the booking-scoped reschedule picker. Access is checked against the booking rather than tutor discovery visibility.
- **Reschedule invariant:** `/rpc/booking/proposeReschedule` and `/rpc/tutorActions/proposeReschedule` reject a proposed start in the same minute as the active booking/target-session start or the pending proposal for that same target with `BOOKING_NOT_EDITABLE`. Proposal replacement is serialized, and only one pending proposal may exist per booking.

### `booking.rejectReschedule`

- **Auth:** Protected; required tutor or active student voter
- **Input:** `{ bookingId, proposalId? }`
- **Output:** `{ booking }`
- **Description:** Rejects the active, unexpired proposal under the same booking-level decision lock, preserves the original schedule, and restores the booking state that was active before the proposal. Expired/stale decisions are rejected and left for the expiry worker. Offline booking-level proposals also restore the confirmed room assignment to the original window; a conflict or missing assignment falls back to `awaiting_admin_room_approval`.

### `booking.proposeReschedule`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason? }`
- **Output:** `{ booking }`
- **Description:** Proposes a new fixed 90-minute time for one booking session; the booking proposer may use the route in the eligible pre-terminal states, including `confirmed` and `scheduled`. Student proposals must remain outside the current and proposed session's H-2 window; otherwise the API rejects the mutation as not editable. Proposals expire after 24 hours and require tutor plus all active-student approval. Force-majeure exceptions are handled through support/admin operations and an auditable admin override, not by bypassing this route.

### `booking.cancelSession`

- **Auth:** Student (proposer)
- **Input:** `{ sessionId }`
- **Output:** `{ booking }`
- **Description:** Student cancels an individual series session before that session starts; pre-H-2 releases the session hold and a pre-start post-H-2 cancellation forfeits it (per-session penalty, #46). At/after the session start it rejects with `BOOKING_CANCELLATION_DEADLINE_PASSED`. Group-series sessions cannot be cancelled (no opt-out).

### `booking.addSessionNote`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId, content }` (`content` max 10,000 chars, sanitized)
- **Output:** `{ note }`
- **Description:** Adds a note to a completed session. The web editor sends allow-listed HTML for paragraphs/headings, emphasis, lists, and links; the API sanitizer remains authoritative before persistence.

### `booking.getSessionNotes`

- **Auth:** Protected (tutor or student party)
- **Input:** `{ bookingId }`
- **Output:** `{ items: SessionNote[] }`
- **Description:** Returns all notes for the completed booking so both parties can read the shared session record. The web client applies a DOMPurify allow-list before rendering note HTML.

### `booking.createGroup`

- **Auth:** Verified Student (`verifiedStudentProcedure` — student role with a verified email; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, targetGroupSize, inviteeUserIds, scheduledStartAt, timezone?, learningGoal, requestedRoomId? }` (`subjectId` selects an active tutor subcategory; `learningGoal` carries Session Notes including reference links; `targetGroupSize` 2–6, `inviteeUserIds` 1–5; duration is fixed to 90 minutes)
- **Output:** `{ booking }`
- **Description:** Creates a group booking, holds the target headcount total from the proposer, invites participants, and releases the excess hold as invitees confirm; idempotency via `idempotency-key` header

### `booking.createSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure`; unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, sessions: [{ availabilitySlotId, scheduledStartAt }], timezone?, learningGoal }` (`subjectId` selects an active tutor subcategory; `learningGoal` carries Session Notes including reference links; 2–4 fixed 90-minute sessions)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400) if sessions < 2 or > 4
- **Description:** Creates a multi-session solo series booking

### `booking.createGroupSeries`

- **Auth:** Verified Student (`verifiedStudentProcedure` — unverified → `FORBIDDEN`)
- **Input:** `{ tutorId, subjectId?, availabilitySlotId, modality, sessions: [...], targetGroupSize, inviteeUserIds, timezone?, learningGoal }` (`subjectId` selects an active tutor subcategory; `learningGoal` carries Session Notes/reference links; `targetGroupSize` 2–6, `inviteeUserIds` 1–5, sessions 2–4)
- **Output:** `{ booking }`
- **Errors:** `BOOKING_SERIES_SIZE` (400), `USER_NOT_FOUND` (400) for unknown invitees
- **Description:** Creates a group series with upfront per-participant holds for all sessions (FR-20, #46); invitees accept/decline the full-series package via `booking.confirmInvite`/`booking.declineInvite`

### `booking.confirmInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId }`
- **Output:** `{ confirmedHeadcount, targetGroupSize }`
- **Description:** Invitee confirms participation and holds Marks

### `booking.declineInvite`

- **Auth:** Student (invitee)
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ declined: true }`

### `booking.withdrawInvite`

- **Auth:** Student (booking proposer)
- **Input:** `{ bookingId, inviteeUserId, reason? }`
- **Output:** `{ withdrawn: true, inviteeUserId }`
- **Description:** Withdraws one pending group or group-series invitation before confirmation. The target participant is marked `withdrawn_pre_h2`; confirmed headcount and Marks holds are unchanged, and the invitee receives a booking notification.

### `booking.reconfirm`

- **Auth:** Student (participant)
- **Input:** `{ bookingId, accept }`
- **Output:** `{ reconfirmed: boolean }`
- **Description:** Participant accepts or rejects the repriced offer

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
- **Input:** `{ bookingId, sessionId?, availabilitySlotId?, proposedStartAt, proposedEndAt?, reason? }`
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
- **Input:** `{ bookingId, reason? }`
- **Output:** `{ booking }`
- **Description:** Tutor declines a booking and releases held Marks

### `tutorActions.completeSession`

- **RPC path:** `/rpc/tutorActions/completeSession`
- **Auth:** Tutor
- **Input:** `{ bookingId, sessionId? }` (`sessionId` required for series child sessions)
- **Output:** `{ booking }`
- **Description:** Marks a scheduled session completed and deducts held Marks
- **Frontend note:** Cancel and complete actions are confirmed with in-app Selia dialogs; mutation feedback is emitted through the global toast layer and does not change this RPC contract.

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
- **Errors:** `BOOKING_NOT_FOUND` (404), `BOOKING_NOT_EDITABLE` (400) before start+15 min, `BOOKING_STATE_TRANSITION` (409) if not `scheduled`
- **Description:** Marks a participant as no-show 15 minutes after the session starts (U5/TC-30); their session hold is forfeited. A solo booking transitions to `no_show`; a group booking stays live and only the target's hold is forfeited (C1); a series session keeps its state so other participants are unaffected.

---

## Room (`room.*`)

### `room.list`

- **Auth:** Protected
- **Input:** None
- **Output:** `{ items: Room[] }` — active rooms
- **Description:** Lists active rooms for offline scheduling

### `room.listPendingApprovals`

- **Auth:** Admin
- **Input:** `{ limit? }` (1–100, default 50)
- **Output:** `PendingRoomApproval[]`
- **Description:** Lists offline bookings in `awaiting_admin_room_approval`, ordered by session start. Each item includes booking timing/participant summary and the optional requested room; bookings whose requested room was unavailable are included with `requestedRoomId: null`.

### `room.create`

- **Auth:** Admin
- **Input:** `{ name, location, capacity }`
- **Output:** `{ room }`
- **Frontend:** Admin → Operations → Room approvals → Active rooms → Add room. The form trims name/location, validates a positive whole-number capacity, and refreshes the active-room list after creation.

### `room.assign`

- **Auth:** Admin
- **Input:** `{ bookingId, roomId, startAt, endAt }`
- **Output:** `{ roomBooking }`
- **Description:** Confirms a room for an offline booking and transitions the booking `AWAITING_ADMIN_ROOM_APPROVAL → SCHEDULED`; notifies tutor + confirmed students (G14, #46). The admin UI invokes this from the Room approvals queue or the booking detail Offline room card; `bookingId` and `roomId` remain internal identifiers in the RPC input.

### `room.checkAvailability`

- **Auth:** Protected
- **Input:** `{ roomId, startAt, endAt }`
- **Output:** `{ available: boolean }`
- **Description:** Returns whether a room is free for a time slot; **known gap G13** — not yet integrated into booking creation (tracked U14 in `docs/plans/active/PRD-GAPS-PHASE3.md`)

### `room.relocate`

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
- **Description:** Includes in-app contact-request notifications when applicable. These notifications contain request metadata and human-readable names only; contact email is never stored in the notification body or metadata.

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
- **Input:** `{ bookingId, category, reason, affectedParticipants?, marksAction?, userNote?, internalNote? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel; `marksAction` one of release_holds/compensate_credit/compensate_deduct)
- **Output:** `{ booking }` — the updated booking
- **Errors:** `BOOKING_NOT_FOUND` (404), terminal-state override rejected
- **Description:** Force state transition bypassing the state machine; optionally adjusts held Marks per participant; records audit log + state history + participant notification

### `adminBooking.previewOverride`

- **Auth:** Admin
- **Input:** Same as `applyOverride`
- **Output:** `{ bookingId, currentState, projectedState, affectedParticipants, marksAction, perParticipantImpact }` — no persistence
- **Description:** Returns the projected booking state and per-participant wallet impact before applying

### `adminBooking.listBookings`

- **Auth:** Admin
- **Input:** `{ bookingId?, limit?, cursor?, category?, urgency?, escalated? }` (`category` one of tutor_no_show/medical_emergency/technical_failure/admin_correction/student_no_show/force_cancel/tutor_lateness_pending — `tutor_lateness_pending` lists sessions flagged by the lateness sweep for admin review)
- **Output:** `{ items: Booking[] & { reportedAt: string | null, slaDeadline: string | null, escalated: boolean }[], nextCursor }`
- **Description:** Paginated booking list sorted by urgency. Supplying `bookingId` performs the exact admin lookup used by `/admin-operations/bookings/:bookingId`, returning zero or one item so the detail page remains refresh-safe. For override reports, `reportedAt` comes from `overrideMeta.overriddenAt`, `slaDeadline` applies OQ-04 (30 minutes Mon–Sat 09:00–21:00 WIB, otherwise 4 hours), and `escalated` is computed against that business-hours deadline.

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
- **Description:** Cancels a single series session; the session hold is released, forfeited, or partially returned per `marksAction` (U6/TC-31); records audit + participant notifications

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
- **Input:** `{ filename, contentType, contentLength }` (`contentType` one of `image/png`/`image/jpeg`/`image/webp`/`image/gif`/`application/pdf`; `filename` max 255 chars, no `..`/leading `/`; `contentLength` is an integer from 1 byte through 5 MB)
- **Output:** `{ uploadUrl, key, publicUrl, contentType, maxBytes, method, fields }` (`maxBytes` 5 MB; `method: "PUT"` for R2 and `"POST"` for local mode; `fields` is `{}` for both current backends)
- **Errors:** `INVALID_CONTENT_TYPE` (400), `INVALID_FILENAME` (400)
- **Description:** Returns a Cloudflare R2 presigned PUT URL whose key, content type, and declared content length are signed, or a local URL (dev, authenticated `POST /uploads/*`) for uploading a file. Browser clients using R2 require bucket CORS for the frontend origin. Uploaded objects are referenced by `key`/`publicUrl` (e.g. private achievement `evidenceUrl`, public `documentationUrl`, or user avatar). Local files are served via `GET /uploads/*` when `R2_PUBLIC_URL` is unset

## Tutor payout profile fields (2026-08-28)

`/rpc/tutor/updateMyProfile` accepts payout-account fields (`bankName`, `bankAccountNumber`, `bankAccountHolderName`, `bankAccountOpeningCity`, `bankAccountOwnership`, and `bankTransferDisclaimerAccepted`) inside the standard `{"json": <input>}` envelope. `/rpc/tutor/getMyProfile` returns the private fields to the authenticated tutor; the public tutor discovery projection omits all of them. `/rpc/tutor/submitForReview` requires every payout field plus the acknowledgment. Only the exact bank name `BCA` represents conventional BCA and has no transfer fee; `BCA Syariah`, `blu`/`BCA Digital`, and all other bank names incur Rp2,500 once per payout. `/rpc/tutor/payouts/get` with no date filters returns honorarium since the latest admin-paid cutoff; explicit date filters remain available for reporting. Admins use `/rpc/admin/payouts/tutor/pending` to inspect unpaid honorarium and `/rpc/admin/payouts/tutor/mark-paid` to atomically create a paid payout record. Completion timestamps, rather than calendar weeks, determine which completed sessions enter a payout batch; completion and payout use a per-tutor lock to avoid a race at the cutoff.
