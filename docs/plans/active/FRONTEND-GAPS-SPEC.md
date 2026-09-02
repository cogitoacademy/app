# Cogito Frontend — PRD Gaps Specification

| Field      | Value                                                                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status     | Living gap inventory (updated 2026-09-02; F1/F8/F9/F13/F14/F18 closed; F16 scope retired; F2/F3/F6/F7/F11/F17 closed by merged PR #55; F12 closed; competition taxonomy and tutor-achievement-format follow-ups implemented; meeting fallback and admin wallet-search follow-ups added) |
| Branch     | `f/frontend-prd-gaps` (merged #55); `f/competition-taxonomy` (PR pending)                                                                                                                                                                                                               |
| Created    | 2026-07-29                                                                                                                                                                                                                                                                              |
| Audited    | 2026-09-02                                                                                                                                                                                                                                                                              |
| Depends on | Backend PRD gaps (G1-G19) where API is needed                                                                                                                                                                                                                                           |
| Scope      | Frontend surfaces plus the admin queue projection needed for SLA detail (`apps/web/`, `packages/api/`)                                                                                                                                                                                  |

This document catalogs all PRD-required frontend surfaces that are not yet implemented. It runs in parallel with (or after) the backend PRD gaps spec — each frontend gap references the backend gap it depends on.

The backend spec is `docs/plans/completed/PRD-GAPS-SPEC.md` (backend-only). This is the frontend counterpart.

### Tutor profile route follow-up (2026-08-31)

The tutor-owned profile editor is now presented at the canonical `/profile`
route and is labeled **Tutor Profile** in the authenticated shell and tutor
sidebar. It is the same editable surface for draft, review, changes-requested,
and published states, so the label does not change after onboarding. The old
`/onboarding` route remains as a compatibility redirect to `/profile` for
tutors and `/dashboard` for other roles. The student avatar menu keeps its
**Profile** item; tutor and admin menus omit a profile item because tutors use
the primary sidebar link and admins use the dedicated Manage Tutors surface.
The student profile route uses the focused `auth.getProfile` response instead
of the wallet/tutor aggregate, while a missing student row is treated as the
initial empty form. No API or database shape changed. Published tutors may update `baseRatesIdr`
from this surface at any time; the new rate applies to future bookings while
existing booking snapshots remain authoritative for weekly payout.

All roles now use Better Auth `user.name` as the one visible name. Tutor
onboarding edits the account field directly and no longer submits the legacy
tutor-profile `displayName`;
discovery, booking, dashboards, sidebar, and admin review render `user.name`.
The compatible discovery response key remains but is projected from the user
record. No database field is removed in this compatibility step.

The tutor profile route now uses the authenticated shell's page-level vertical
scroll container, matching the student profile and avoiding an inner form
scrollbar. Direct shell children cannot flex-shrink, so the tutor wrapper and
onboarding root share the form's natural height. Subject-category fieldsets retain natural heights so
short categories do not create large blank areas. The final action card stays
in normal document flow so it cannot leave trailing scroll space. This is
presentation-only and does not change any API or database contract.

### Tutor profile validation and save actions follow-up (2026-09-01)

The tutor profile editor now keeps progress saving separate from review
submission. **Save draft** (or **Save profile changes** for a published profile)
allows incomplete required top-level fields, while malformed values are shown on
the individual control, repeated in a compact validation summary, and included
in first-error focus behavior. **Submit for review** applies the complete
required-field gate before saving and submitting. API-side incomplete-profile and
pricing errors preserve their field details so the editor can highlight the
affected area instead of showing only a generic failure. The RPC paths and
request envelope remain unchanged. Published tutors keep both actions available
while an edit proposal is under review: saving updates the pending proposal,
and submitting validates and queues the latest version.

### Role-aware login destination follow-up (2026-08-31)

The web login handoff now reads the existing tutor profile onboarding status
before selecting the default destination. Tutors without a profile, or with
`draft`/`changes_requested` status, go to `/profile` so they can complete or
correct onboarding. Tutors whose profile has moved into review, approval,
publication, or suspension, along with admins and students, go to
`/dashboard`. A validated `redirect` query remains an explicit return path,
and the same destination is preserved through `/verify-email` for unverified
accounts. This is frontend routing only and adds no API or database contract.

### Tutor profile and payout privacy follow-up (2026-08-28)

Tutor onboarding now has one structured Achievements section and one structured Experiences section, with legacy achievement/credential/experience text retained as a fallback. Achievement and experience entries use repeatable cards with bounded year fields; year values remain ungrouped, and an ongoing experience leaves End year blank. Client-side max-length checks measure the trimmed value to match the API schemas. Availability-summary and credential-proof inputs are retired. Base honorarium is adjusted only through Rp 5,000 minus/plus controls and its six group-size outcomes are shown in tables. Tutor portraits use a staged source-to-final workflow: the tutor submits one uploaded source image, an admin uploads the background-standardized replacement, and approval/publication promotes that replacement to the canonical public image; the tutor/admin surfaces expose the review history. Tutor-facing history shows actor names/types without account emails. Tutor payout details expose only completed sessions and IDR honorarium, removing take-rate and Marks terminology from the tutor interface.

Achievement and Experience sections retain separate optional proof URL fields for compatibility. The tutor-facing copy recommends putting both evidence types in one Google Drive folder with the “Anyone with the link can view” setting. The URLs remain visible to admins during review, participate in the protected edit-review flow, and are intentionally omitted from public tutor discovery.

### Tutor experience formatting follow-up (2026-08-31)

The Experiences section now stores up to five structured `experienceEntries` with role, organization, start year, nullable end year, and brief description. The API keeps legacy `experiences` text as a compatibility fallback, while public discovery and admin review render structured entries when present. Migration `0040_colossal_morlun.sql` adds the JSONB array with an empty-array default.

### Tutor achievement formatting follow-up (2026-08-31)

Tutor onboarding captures structured education (up to 2 entries) and one structured competition-achievement section (up to 5 entries) alongside one multiline Experiences field. Each competition entry stores a name, year, and one or more award titles; the editor accepts comma-separated awards, keeps an in-progress comma visible while the next title is being typed, keeps year values ungrouped, and previews the public format with a bold first line and readable spacing. Experience role, organization, and description text preserves comma punctuation. Published tutor discovery returns the structured arrays and falls back to legacy achievement/credential text for older profiles. Admin tutor review includes an **Edit format** action backed by `adminTutor.updateTutorAchievements`, optimistic `version` checks, and an audit event for corrections. Migration `0039_secret_blink.sql` adds the two JSONB fields after the migrations already present on `main`.

### Subject taxonomy follow-up (2026-08-25)

Tutor onboarding now uses the normalized competition category/child-subject catalog exposed by `tutors.listSubjects`. The current catalog has seven categories and 33 child subjects. Tutors must select at least one current child subject before submitting for review, and the student tutor catalog supports category and child-subject filters. Archived legacy subjects remain visible on existing tutor profiles but cannot be newly selected. The legacy expertise field remains a compatibility fallback; future category changes should preserve the pending-review behavior for published profiles.

The onboarding selector stores normalized IDs for persistence and renders all current categories with keyboard-accessible checkboxes. Tutors may select at most 7 active child subjects; the selector shows the cap and current count, disables an eighth choice, and the submit/API validation rejects any over-limit payload. Selected subjects appear as chips, while archived profile subjects are shown read-only. The tutor list continues to support selecting multiple mother categories and child subjects; child options are the union of the selected categories, the API matches selected values within each facet, and the list query debounces rapid search/filter changes by 300 ms.

### Admin tutor review readability follow-up (2026-08-27)

The admin tutor review card now resolves proposed `subjectIds` through the active taxonomy and renders category/subject labels as wrapping badges instead of exposing raw UUIDs. Other pending values also wrap safely on narrow cards. This is presentation-only; the `adminTutor.listTutorProfiles` and `adminTutor.reviewTutorProfile` contracts are unchanged.

### Achievement list table follow-up (2026-09-02)

The student `/achievements` list and admin `/admin-achievements` moderation queue now use compact minimum-width Selia tables instead of card grids. Rows expose core identity/status/date information and a shared detail drawer contains the full metadata, proof/documentation links, moderator notes, and the relevant student or admin actions. The table containers scroll horizontally when the viewport is narrower than the column minimums, without changing any RPC, schema, or persistence contract.

### Tutor discovery pricing matrix follow-up (2026-08-27)

The student-facing tutor drawer now combines the available Online and Offline Marks maps into one group-size table. Each modality has its own price column, populated values use the shared Cogito Marks icon prefix, and an em dash makes a missing modality/size combination explicit. This is a presentation-only change; the `tutors.listPublished`/`tutors.getProfile` response and pricing contracts are unchanged.

### Competition Calendar parity follow-up (2026-08-23)

The authenticated calendar now carries the full read-only interaction model from `cogito-acad`: a responsive month grid with multi-day spans and overflow popup, a 30-day agenda view with rich event cards, period navigation, `M`/`A` keyboard shortcuts, and a responsive details modal with metadata and external actions. The app intentionally keeps its own Selia components, design tokens, Tabler icon set, and English-only copy; Sanity remains the source of truth and the API contract is unchanged.

### Competition Calendar scroll containment follow-up (2026-08-26)

The calendar route now uses a viewport-contained app shell. The page heading and calendar toolbar remain stationary, the calendar card body owns vertical scrolling, and the month grid owns horizontal scrolling on narrow screens. This is presentation-only; the read-only `content.listCompetitions` contract and event interactions are unchanged.

### Theme shortcut follow-up (2026-08-26)

The authenticated shell's existing Light/Dark/System menu now also responds to `D`. Outside editable fields, the shortcut toggles between the currently rendered light and dark modes, including when the saved preference is System; repeated keydown events and modifier-key combinations are ignored. `next-themes` continues to own preference persistence. This is frontend-only and adds no API, schema, or persistence contract.

### Profile UX follow-up (2026-08-22)

The student profile and tutor onboarding surfaces now share a responsive account-identity editor. Student learning and parent/guardian fields are separated into clear cards with a completion indicator and one learning-profile save action. Tutor onboarding keeps profile status and review feedback visible, groups public profile/teaching setup/availability fields, presents pricing in a compact responsive grid, and consolidates draft/save/submit actions into a sticky footer. No profile or auth API contracts changed.

The tutor profile photo upload now appears before the rest of the editable profile fields and uses the same compact clickable-avatar crop interaction as the student editor. Published tutors see current and proposed photos separately, with explicit review messaging; full image previews open on demand through the shared Selia `InfoPreview` popover. The admin review drawer compares those assets side by side and approval promotes the proposed URL through the existing pending-change contract.

The admin tutor index now surfaces the edit-review state in its status badge: a published tutor with submitted changes is shown as **Edit review**, while a returned edit is shown as **Revision requested**, so pending work is visible without opening each drawer.

### Student profile photo crop follow-up (2026-08-31)

The student identity card now uses its avatar as the compact photo-picker trigger, with a pencil badge indicating editability. Clicking it retains the existing upload, circular crop, and save flow while removing the separate photo input from the card body.

The student account-identity editor now accepts a local JPG, PNG, or WebP upload
instead of a manually entered image URL. A circular crop dialog supports pointer
dragging and zoom before producing a 512px square JPEG. The client uploads that
asset through the existing protected `upload.createUploadUrl` flow, keeps the
returned URL in the account form, and only applies it through Better Auth when
the student saves account details. The existing upload RPC now also receives the
cropped blob's `contentLength`; no new RPC or persistence contract was added.

### R2 browser upload follow-up (2026-09-01)

The shared upload module now uses the Cloudflare-supported presigned `PUT`
flow for R2; the previous multipart-form `POST` flow returned
`501 NotImplemented`. Upload requests carry the exact cropped file length so
the presigned request remains bounded to the 5 MB module limit. The upload
bucket also has CORS rules for the local and production frontend origins,
allowing `GET`, `PUT`, and `HEAD` with `Content-Type`.

### Auth form validation follow-up (2026-08-25)

The `/login` sign-in and sign-up forms now validate each touched field on
change and blur, show deduplicated Selia inline errors with danger outlines,
and keep blocked submissions at the field level. Sign-up keeps the
server-aligned 8-character uppercase/lowercase/digit password policy visible
as helper copy, while name and email whitespace is normalized before the
Better Auth request. No auth endpoint, request/response shape, or persistence
contract changed.

### Empty-state consistency follow-up (2026-08-25)

The frontend now routes collection empty states through the shared
`apps/web/src/components/empty-state.tsx` presentation module. Page/card states
use `EmptyStateCard`; embedded states use the `default`, `compact`, or `inline`
densities. Calendar periods, filtered resource/tutor results, booking detail
sections, notifications, Marks ledgers, subject/proof-link fields,
availability previews, and admin tables now have intentional no-data copy
instead of blank panels or one-off text. Month and agenda views also explain
when the selected period has no events. No API, schema, or persistence contract
changed.

### Loading-state follow-up (2026-08-25)

The shared route, onboarding, and auth loading state now renders a visible
token-based ring with a contrasting track, the local Selia `Spinner` as its
primary progress arc, and a `Loading` label instead of a small arc that could
read as a stray line. Reduced-motion users still receive a clear static
loading indicator. No API, schema, or persistence contract changed.

Update (2026-08-28, started-session cancellation): student cancellation now closes at `scheduledStartAt` in both the booking service and detail action visibility. The backend remains authoritative and returns `BOOKING_CANCELLATION_DEADLINE_PASSED` for direct or stale-client attempts, preserving tutor completion and payout handling; post-start disputes use the existing support/admin path.

### Shared booking list follow-up (2026-08-22)

Update (2026-08-28): navigation is now Needs action, Upcoming, Recurring, History, and All. History consolidates terminal outcomes; URL-backed Recommended/Soonest/Latest sorting defaults to decisions first, active bookings next, and terminal outcomes last. Students and tutors land on Needs action whenever pending decisions exist.

Update (2026-08-28, timing): shared booking cards now show server-deadline countdowns for pending states and same-day/start proximity indicators for confirmed or scheduled sessions. The implementation shares one live clock across visible cards and does not alter lifecycle state client-side.
The indicator is positioned after financial metadata in the list; dashboard next-lesson cards intentionally suppress financial metadata.

The booking list is now one role-aware surface at `/_app/bookings`. Students,
tutors, and admins use the protected `booking.listMine` read contract; the
service resolves proposer/participant visibility for students, assigned
bookings for tutors, and the complete set for admins. `/_app/tutor-bookings`
remains as a compatibility redirect. The list keeps status/action semantics in
the booking detail page, shows tutor earnings/total Marks where relevant, and
uses a compact date/location/tutor metadata arrangement on mobile, shows only
student participants in the avatar stack, and displays single-session group
prices per student for the student viewer. Admin detail is read-only; admin
mutations remain in the operations console. Marks values use the Cogito mark
icon as a prefix, and visible status badges reveal the state explanation on
hover or keyboard focus.

The shared booking list offers Recommended, Soonest, and Latest ordering
while keeping past/cancelled history newest-first. Defaults are role-aware:
students see Upcoming, tutors see Pending when requests exist (or Upcoming
otherwise), and admins see All; an explicit `tab` query parameter wins.

### Booking-list tab overflow follow-up (2026-08-26)

The rounded booking status-tab strip fills the available width on narrow
screens. Only its inner tab list remains horizontally swipeable, while the
native scrollbar is hidden so the page itself does not overflow. This is a
presentation-only change with no RPC, schema, or persistence contract change.

### Booking-list overflow polish follow-up (2026-08-28)

The booking tab scroller now includes internal horizontal and vertical paint
padding, so the selected tab's shadow and keyboard focus ring remain visible at
the edges while horizontal swiping stays inside the tab list. The shared
`EmptyStateCard` keeps its rounded decorative glow and card shadow visible
without widening the page, and loading/error/list branches use explicit
`min-w-0`/`max-w-full` constraints. This is presentation-only; the
`booking.listMine` contract is unchanged.

### Dashboard next-lesson and onboarding follow-up (2026-08-24)

Student and tutor dashboards now derive the nearest future non-terminal,
non-pending booking from the existing `booking.listMine` read model. Both
surfaces render the extracted `BookingListCard` used by `/_app/bookings`, with
the same date tile, participant metadata, Marks treatment, status tooltip, and
booking-detail action. The tutor dashboard now puts welcome and teaching setup
beside each other, then keeps the review queue and next-lesson section in the
next visible row; the review card has a stable loading/empty state. Student and
tutor now share the same SVG welcome-card component and sizing while retaining
role-specific copy and links. A successful tutor onboarding submission
invalidates the profile/auth queries and redirects to `/dashboard` with history
replacement. No API or database contract changed.

### Booking detail UX follow-up (2026-08-22)

The detail page now renders participant profile images with initials fallback,
uses the Cogito mark asset as the prefix for Marks amounts, and presents state
history as a vertical transition timeline with actor, timestamp, state chips,
and reason. Online meeting access explains the `confirmed`/link-pending and
provider-failed states and refreshes while a link is being prepared. The
backend starts link generation when the tutor accepts after required
confirmations; successful generation moves the booking to `scheduled`, while
failed Google attempts remain `confirmed` for the 5-minute retry job. Manual
admin links update the newest meeting-attempt row so the detail read remains
consistent after retries.

### Admin booking-detail modal readability follow-up (2026-08-31)

The admin Operations booking-detail modal now uses an admin-only responsive
width override, so it opens as a wide desktop inspector without changing the
shared/student dialog sizing. Its content area remains vertically scrollable,
the header and footer stay stable, summary metrics step down from four columns
to two on smaller screens, and participant/wallet cards use a non-stretching
responsive split. This is presentation-only; no RPC, schema, or persistence
contract changed.

---

### Admin wallet lookup search follow-up (2026-09-02)

The Operations → Wallet lookup tab now searches visible user identity instead
of requiring an admin to know an internal user ID. `admin.searchUsers` matches
name, email, or ID and returns a bounded identity projection; exact email/ID
matches are ranked first. The admin selects one result before the UI loads
`admin.getWallet` and `admin.listLedgerEntries`, so the internal ID remains an
implementation key rather than the primary operator workflow.

---

## Current Frontend State

### Existing routes (`apps/web/src/routes/`)

The tutor booking form now exposes optional student invitations at all times.
Booking type is derived from invitees (none = solo, one or more = group), so
students no longer need to select a separate solo/group mode before searching
for classmates.

| Route                        | Component                                 | Status                                                                                                                                                               |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (index)                  | Landing redirect                          | Exists                                                                                                                                                               |
| `/login`                     | sign-in-form.tsx                          | Exists                                                                                                                                                               |
| `/auth/callback`             | auth callback                             | Exists                                                                                                                                                               |
| `/invite`                    | invite-claim-page.tsx                     | Exists                                                                                                                                                               |
| `/_app`                      | App layout + sidebar                      | Exists                                                                                                                                                               |
| `/_app/dashboard`            | role-specific dashboard pages             | Complete — student, tutor, and admin next-action views using existing oRPC data                                                                                      |
| `/_app/balance`              | balance-page.tsx                          | Exists (wallet + Knowledge Bank card)                                                                                                                                |
| `/_app/calendar`             | competition-calendar-page.tsx             | Complete — authenticated, English-only read-only calendar backed by published Sanity content                                                                         |
| `/_app/knowledge-bank`       | knowledge-bank-page.tsx                   | Complete — student 35-Mark gate plus unrestricted tutor/admin access, metadata search/filter, and protected PDF preview                                              |
| `/_app/bookings`             | bookings-page.tsx                         | Exists (role-scoped list and lifecycle entry points)                                                                                                                 |
| `/_app/bookings/$bookingId`  | booking-detail-page.tsx                   | Complete baseline — detail, lifecycle, reschedule, reporting, invites, notes, history                                                                                |
| `/_app/tutors`               | tutors-page-content.tsx                   | Exists (discovery list)                                                                                                                                              |
| `/_app/tutors/$tutorId/book` | create-booking-page.tsx                   | Exists (solo/group/series creation)                                                                                                                                  |
| `/_app/achievements`         | achivements-page.tsx                      | Exists (submission + table list)                                                                                                                                     |
| `/_app/profile`              | profile-page.tsx + tutor-profile-page.tsx | Complete — role-aware student profile and tutor profile editor; tutor state, review feedback, pricing, and consolidated actions are available at the canonical route |
| `/_app/onboarding`           | compatibility redirect                    | Complete — legacy tutor links redirect to `/profile`; other roles redirect to `/dashboard`                                                                           |
| `/_app/tutor-bookings`       | tutor-bookings-page.tsx                   | Compatibility redirect to the shared `/bookings` list                                                                                                                |
| `/_app/availability`         | availability-page.tsx                     | Complete baseline — Calendly-style weekly hours, date overrides, rules summary, and week preview                                                                     |
| `/_app/notifications`        | notifications-page.tsx                    | Exists (full page)                                                                                                                                                   |
| `/_app/admin`                | admin-dashboard-page.tsx                  | Complete F1 admin workspace entry point                                                                                                                              |
| `/_app/admin-operations`     | admin-operations-page.tsx                 | Complete F1 queue/detail surface — filters, hydrated participants/wallets/ledger, override, rooms, and searchable wallet lookup                                      |
| `/_app/admin-tutors`         | admin tutor invite + review               | Complete — invite/review queue plus version-checked structured achievement correction                                                                                |
| `/_app/admin-achievements`   | achievement-moderation-page.tsx           | Exists (table-based moderation UI)                                                                                                                                   |
| `/_app/admin-economy`        | economy-settings-page.tsx                 | Complete — admin-managed Cogito take schedule with validation, preview, optimistic versioning, and audit-backed persistence                                          |

### Remaining gaps (no complete surface yet)

The PRD §Product Surfaces and Permissions (prd.tex:317-375) defines required screens. The following are **not implemented**:

---

## Frontend Gap Summary

| #   | Gap                                           | PRD Ref                | Depends on (backend)                                   | Effort | Status                                                                                                                         |
| --- | --------------------------------------------- | ---------------------- | ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| F1  | Admin dashboard + override queue              | FR-10, OQ-04           | G8, G9, G10                                            | 3d     | **Closed (2026-08-22)** — dedicated route, hydrated participant wallets/ledger, OQ-04 SLA deadline/status, and escalation link |
| F2  | Admin override form with before/after preview | FR-10, prd.tex:717-728 | G10                                                    | 2d     | Closed                                                                                                                         |
| F3  | Report tutor lateness/no-show button          | FR-14, DL-26           | G1                                                     | 1d     | Closed                                                                                                                         |
| F4  | Competition Calendar link                     | FR-11                  | Sanity content module + protected route                | 1.5d   | **Closed (authenticated Sanity-backed calendar with academy-parity month/agenda/modal UX)**                                    |
| F5  | WhatsApp support button                       | FR-14, OQ-04           | None (external link)                                   | 0.5d   | Closed                                                                                                                         |
| F6  | Tutor reschedule proposal UI                  | FR-15                  | G6                                                     | 1d     | Closed                                                                                                                         |
| F7  | Student reschedule approval UI                | FR-15                  | G6                                                     | 1d     | Closed                                                                                                                         |
| F8  | Series session completion UI                  | FR-20                  | G18                                                    | 1d     | **Closed (REVIEW-FIXES-3 P6)**                                                                                                 |
| F9  | Session notes (rich-text) view + add          | FR-09, DL-18           | G7                                                     | 1.5d   | **Closed (2026-08-22)** — toolbar editor, client DOMPurify render pass, and author context                                     |
| F10 | Notifications page                            | FR-17                  | G17                                                    | 1.5d   | Closed                                                                                                                         |
| F11 | Admin wallet/ledger view                      | FR-10                  | G9                                                     | 1d     | **Closed** — wallet lookup now resolves users by name/email/ID before loading wallet and ledger                                |
| F12 | Admin room approval UI                        | FR-22                  | G14                                                    | 1d     | **Closed (room approval queue)**                                                                                               |
| F13 | Tutor payout view                             | DL-11                  | G16 (`tutor.getMyPayouts` exists since #43)            | 0.5d   | **Closed (REVIEW-FIXES-3 P6)**                                                                                                 |
| F14 | Group series no opt-out disclaimer display    | FR-20                  | G15                                                    | 0.5d   | **Closed (REVIEW-FIXES-3 P6)**                                                                                                 |
| F15 | Knowledge Bank gating flow (full)             | FR-12                  | Sanity content module + protected file proxy           | 1.5d   | **Closed (student-gated and tutor/admin-accessible app content with protected files)**                                         |
| F16 | Achievements public landing surfacing         | FR-18                  | No active app landing route; public procedure retained | 1d     | **Scope retired (2026-08-23)**                                                                                                 |
| F17 | Booking detail page (implemented baseline)    | FR-07, FR-08           | G6, G11                                                | 2d     | Closed                                                                                                                         |
| F18 | Group invite accept/decline/reconfirm UI      | FR-20, TC-25           | G15                                                    | 1d     | **Closed** — invitee actions plus proposer-side pending-invite withdrawal                                                      |
| F19 | Admin economy rate-control UI                 | FR-05, DL-29           | Economy module + migration 0028                        | 1d     | **Closed** — active schedule editor and all-role E2E coverage                                                                  |

**Total estimated effort: ~0 days for remaining tracked gaps (F1–F19 are closed).**

> **Audit 2026-08-14:** F4, F5, F10, F15 verified **closed** in `apps/web` (git HEAD `9b7df5e`). F8, F16, F17 remain partial. All remaining missing gaps have backend procedures ready except F13 (needs new `tutor.getMyPayouts` router) and F16 (needs a new public achievement list procedure).

> **Audit 2026-08-16 (against open PR #55 `f/frontend-prd-gaps`):** The open PR delivers F2, F3, F6, F7, F11, F17 (marked **Closed*** = implemented in the PR, pending merge) and partial F1/F9/F12/F15. After it merges, still open: **F8** (per-session series completion — UI has no session list/`sessionId`), **F13** (tutor payout view; backend `tutor.getMyPayouts` **exists since #43**), **F14** (group-series no-opt-out disclaimer display), **F16** (public achievements; no public procedure exists), plus F18 inviter-side `withdraw` UI, J2 proactive session-expiry UX, and the dead-components cleanup. The P2 blockers are resolved in the branch: type checks use `tsgo`, achievement fields are renamed end-to-end, migrations are rebased to `0020`–`0022`, the audited sections are retained, and temporary QA artifacts are removed. Final GitHub CI remains required before merge.

> **Audit 2026-08-19 (against main `d11962b`):** PR #55 merged (`d4e50e0`). Verified in `apps/web/src`:
>
> **Follow-up 2026-09-02:** The admin booking-detail dialog is replaced by the refresh-safe admin-only `/admin-operations/bookings/:bookingId` page. The booking monitor table now uses consistent readable type, stable column sizing/top alignment, and non-wrapping badges while retaining horizontal overflow for narrow viewports.
>
> **Follow-up 2026-08-22 (against main `12dab67`):** The admin operations queue now includes category filtering and a booking-detail dialog that consumes `adminBooking.getBookingStateHistory`; the Rooms tab now consumes `room.listPendingApprovals` and exposes queue-backed assign/choose-another/cancel actions. The F6 reschedule action now dispatches by viewer role: student proposers use `booking.proposeReschedule`, tutors use `tutorActions.proposeReschedule`. The F1 follow-up branch closes the remaining admin route, participant/wallet/ledger, and OQ-04 SLA presentation gaps.
>
> - **F2/F3/F6/F7/F11/F17 → Closed** — override dialog with `previewOverride`/`applyOverride` (`admin-operations-page.tsx`), lateness report via `support.createTicket` (`booking-lifecycle-actions.tsx`), reschedule propose/accept/reject, wallet/ledger lookup tab, booking detail baseline.
> - **F8 → Closed** — series bookings render a per-session list with per-session "Complete session" buttons calling `completeSession({ bookingId, sessionId })` (`booking-detail-page.tsx`).
> - **F13 → Closed** — payout card on the tutor dashboard via `tutor.getMyPayouts` (`tutor-dashboard-page.tsx`).
> - **F14 → Closed** — booking detail renders the backend `disclaimer` in a warning callout (`booking-detail-page.tsx:304`).
> - **F16 → Scope retired (2026-08-23)** — the unused app landing page is archived and `/` redirects directly to `/login`; `achievement.listApproved` remains available for a future public surface.
> - **F1 → Closed** — `/_app/admin` is the admin workspace entry point; the operations queue exposes category/urgency/SLA filters, reported reason/source/time-since-report, business-hours deadline/status, and a WhatsApp escalation link. The booking detail loads the full booking read model plus each participant's wallet and booking-scoped ledger entries.
> - **F9 → Closed** — completed-booking notes now use a toolbar editor for paragraphs/headings, emphasis, lists, and links. Both preview and persisted note rendering pass through a DOMPurify allow-list, with the existing server sanitizer remaining authoritative.
> - **F12 → Closed** — `admin-operations-page.tsx` now consumes `room.listPendingApprovals` for offline bookings in `awaiting_admin_room_approval`; admins can assign the requested room, load a booking to choose another room (or use the existing relocate operation), and cancel the pending approval. The backend queue also includes requested-room conflicts with no `room_booking` row.
> - **F18 → Closed (2026-08-22 follow-up)** — invitee confirm/decline/reconfirm plus proposer-side pending-invite withdrawal are wired. The new `booking.withdrawInvite` procedure marks only a pending invitee `withdrawn_pre_h2`, preserves headcount/holds, and notifies the target.
> - **J2 → Closed** — the shell warns during the final 30 minutes and retains the 401/403 redirect fallback.
> - **J2 → Closed** — the shell warns during the final 30 minutes and retains the 401/403 redirect fallback.
> - **Dead components → Closed** — the previously unused `chart.tsx`, `data.ts`, and `user-menu.tsx` files were removed; no references remain in `apps/web/src`.

---

## Detailed Gap Specifications

### F1: Admin Dashboard + Override Queue

**PRD:** FR-10 (Admin Override), OQ-04 (SLA escalation), prd.tex:717-728

**Current state:** **CLOSED (2026-08-22).** The dedicated `/_app/admin` route owns the admin workspace. The operations queue supports category, urgency, and SLA-status filtering; reports show affected-user count, reason/source, elapsed time, OQ-04 deadline, and escalated status with the WhatsApp escalation channel. The booking-detail dialog consumes the full admin-safe `booking.get` read model, renders the hydrated participant roster with per-wallet balances and booking-scoped ledger entries, and retains state history plus override actions.

**Required:**

1. New route `/_app/admin` — admin dashboard with:
   - Booking monitor: list all bookings (calls `adminBooking.listBookings`), sorted by urgency
   - Exception/override queue: bookings flagged for admin action, sorted by SLA deadline ascending
   - Filters: override category, urgency level, SLA status
   - Each queue item shows: booking id, session time, current state, affected users, held/deducted Marks, reported reason, report source, time since report, SLA status

2. Booking detail view (admin): full state history, participants, wallet impact, override action button

3. SLA escalation indicator: if SLA deadline passes without admin action, flag as escalated (OQ-04: 30 min business hours, 4 hours outside; escalate via WhatsApp +62 881-0119-90195)

**Acceptance:**

- Admin sees override queue sorted by urgency
- SLA-expired items flagged
- Filters work
- Clicking a queue item opens booking detail

---

### F2: Admin Override Form with Before/After Preview

**PRD:** FR-10, prd.tex:717-728 (Emergency Override UI/UX Requirements)

**Current state:** **CLOSED (2026-08-19).** Override dialog with category/marks-action/reason/participants/user+internal notes and before/after preview (`previewOverride` → `applyOverride`) in `admin-operations-page.tsx` (merged #55).

**Required:**

Full override form per PRD §Emergency Override UI/UX:

1. Override category select: tutor no-show, student emergency, payment/wallet issue, platform error, offline room issue, admin correction
2. Reason (required, textarea, bounded)
3. Affected participant(s) (multi-select from booking participants)
4. Marks action select: no Marks change, release held Marks, add compensating Marks, reverse incorrect deduction, partial return, manual finance follow-up
5. User-visible note (sent to affected users)
6. Internal admin note (not shown to users)
7. **Before/after preview** (calls `admin.previewOverride` — G10): shows booking state before/after, wallet balance changes, participant impact
8. For payment/wallet overrides: display payment record, ledger entries, Marks credited, Marks spent, remaining balance, prior refund references (prd.tex:724)
9. Submit writes audit log + sends affected users in-app notification; email only if booking status/wallet/schedule changes

**Acceptance:**

- Admin opens override form → all required fields present
- Preview shows before/after booking state + wallet impact
- Submit creates audit entry + notification
- Cannot submit without reason + category

---

### F3: Report Tutor Lateness/No-Show Button

**PRD:** FR-14, DL-26, prd.tex:747

**Current state:** **CLOSED (2026-08-19).** `booking-lifecycle-actions.tsx` (`canReportLateness` student + ≥15 min after start → `support.createTicket`; ticket status on booking detail) — merged via #55.

**Required:**

1. On booking detail page (F17), after scheduled start time, show "Report tutor lateness / no-show" button
2. Button visible only when: booking is `scheduled`, current time > scheduled start time, user is the student (proposer)
3. Clicking opens a form: category (tutor_late / tutor_no_show / technical / payment / other), description
4. Calls `support.createTicket` (G1 backend)
5. After submission: show "Report submitted, admin will review" confirmation
6. Link to view ticket status

**Acceptance:**

- Button appears 15 min after scheduled start if tutor hasn't joined
- Student submits report → ticket created, confirmation shown
- Student can view ticket status

---

### F4: Competition Calendar Link

**PRD:** FR-11

**Current state:** **CLOSED (2026-08-23).** Competition Calendar is an authenticated app route backed by the published Sanity source. The bilingual academy landing page sends users to app login with a `/calendar` return path; the legacy localized pages redirect to that login CTA.

**Required:**

1. Student dashboard: expose the authenticated `/calendar` route
2. Public bilingual landing page: link to app login with the calendar return path
3. No Marks condition — any signed-in student can open it

**Acceptance:**

- Authenticated users can browse published competition entries in the app
- Calendar data is projected from Sanity on the server and is English-only in the app
- Clicking the academy CTA opens app login and returns to `/calendar`

---

### F5: WhatsApp Support Button

**PRD:** FR-14, OQ-04, prd.tex:1260

**Current state:** **CLOSED (2026-08-31).** WhatsApp support actions use `wa.me/62881011990195` in the authenticated sidebar, dashboard, admin escalation surface, and archived marketing landing page. Each action first opens a confirmation dialog that shows `+62 881-0119-90195`; the conversation opens in a new tab only after confirmation.

**Required:**

1. Add WhatsApp support button to student dashboard sidebar or footer
2. Links to `https://wa.me/62881011990195` (the wa.me link for +62 881-0119-90195)
3. Visible to all authenticated users

**Acceptance:**

- WhatsApp button visible on dashboard
- Clicking opens a confirmation dialog with the support number
- Cancel leaves the user in Cogito; Continue opens WhatsApp with the support number

---

### F6: Tutor Reschedule Proposal UI

**PRD:** FR-15

**Current state:** **CLOSED (2026-08-19; role-dispatch follow-up 2026-08-22; no-op/race guards 2026-08-28).** `booking-reschedule-action.tsx` (calendar + time input + reason; role-aware `booking.proposeReschedule`/`tutorActions.proposeReschedule`, per-session `sessionId`, supersedes pending proposal) — merged via #55 with the tutor route wiring corrected in the follow-up. The UI disables proposals matching either the active start or pending proposal; the service applies the same invariant to booking and series-session targets, serializes replacement, and the database permits only one pending proposal per booking.

**Required (after G6 backend fix):**

1. On tutor booking detail (`_app.tutor-bookings`), add "Propose reschedule" action for bookings in `confirmed`/`scheduled` state
2. Form: new date/time picker, reason (optional)
3. Calls `tutorActions.proposeReschedule` for tutors (the student proposer path uses `booking.proposeReschedule`)
4. Shows pending status after submission

**Acceptance:**

- Tutor can propose new time → booking enters `reschedule_proposed`
- Student notified (via G17 notification matrix)

---

### F7: Student Reschedule Approval UI

**PRD:** FR-15

**Current state:** **CLOSED (2026-08-19).** `booking-lifecycle-actions.tsx` (accept/reject with `proposalId`, multiparty `decisions` voting — unanimous required, restore pre-proposal state) — merged via #55.

**Required (after G6 backend):**

1. On booking detail (F17), if booking is in `reschedule_proposed` state and user is the proposer (student):
   - Show proposed new time + reason
   - "Accept" button → calls `booking.acceptReschedule`
   - "Reject" button → calls `booking.rejectReschedule`
2. After accept: booking time updated, confirmation shown
3. After reject: booking unchanged, notification sent to tutor

**Acceptance:**

- Student sees reschedule proposal with accept/reject
- Accept → booking time updates
- Reject → booking stays at original time

---

### F8: Series Session Completion UI

**Status: CLOSED (REVIEW-FIXES-3 P6)** — tutor booking detail for series bookings now lists each session (date/time/state) with a per-session "Complete session" button (enabled once the session end has passed) calling `completeSession({ bookingId, sessionId })`.

**PRD:** FR-20

**Current state (at the time of writing):** **PARTIAL (2026-08-16).** Tutor booking detail has a single whole-booking complete-session button; there is **no per-session list** and no `sessionId` passed, so series completion fails (`BookingSessionRequiredError`). Backend `completeSeriesSession`/`completeSession({sessionId})` is ready (solo + group series, per-session deduction). NOT covered by PR #55.

**Required (backend ready):**

1. On tutor booking detail for series bookings, list each session with its state
2. "Complete" button per session (enabled when session start time has passed)
3. Calls `booking.completeSession` with sessionId
4. After all sessions complete: booking shows `completed`

**Acceptance:**

- Tutor sees series sessions list with complete buttons
- Completing one session deducts that session's Marks
- All sessions complete → booking state `completed`

---

### F9: Session Notes (Rich-Text)

**PRD:** FR-09, DL-18, prd.tex:1033-1043

**Current state:** **CLOSED (2026-08-22).** Completed bookings expose a shared notes view for both parties and a toolbar editor supporting paragraphs, headings, bold, italic, bullet lists, numbered lists, and safe links. Preview and persisted note rendering use a DOMPurify allow-list before `dangerouslySetInnerHTML`; the API still sanitizes and validates content server-side.

**Required (after G7 backend):**

1. On booking detail (after session completed), "Add session note" section
2. Rich-text editor supporting: paragraphs, headings, bullet lists, numbered lists, links, bold, italic
3. Sanitize on render (DOMPurify allow-list; server sanitizer remains authoritative)
4. "View notes" section showing all notes from both parties
5. Only visible after session is completed

**Acceptance:**

- Tutor adds note with formatting → renders correctly
- Student views notes → sees formatted content
- XSS attempt → sanitized

---

### F10: Notifications Page

**PRD:** FR-17

**Current state:** **CLOSED (2026-08-14; triage refinement 2026-08-24).** Full `/_app/notifications` page provides cursor pagination, category badges, exact timestamps, visible read/unread states, row selection, select-all for loaded rows, batch read/unread actions, mark-all-read, booking links, and the unread count in the sidebar bell. Category filtering remains optional and unimplemented (nice-to-have, not a PRD blocker).

**Required:**

1. New route `/_app/notifications` — full notification list
2. Calls `notification.list` with cursor pagination
3. Show: title, body, category badge, read/unread state, timestamp, booking link
4. "Mark as read"/"Mark as unread" per notification and for selected rows + "Mark all as read"
5. Unread count badge in sidebar (already has `notification-bell.tsx`)
6. Filter by category (optional)

**Acceptance:**

- Notifications page lists all notifications
- Mark as read/unread works for a row and selected rows
- Select all controls the currently loaded notification rows
- Unread badge updates

---

### F11: Admin Wallet/Ledger View

**PRD:** FR-10

**Current state:** **CLOSED (2026-09-02).** Wallet lookup tab in `admin-operations-page.tsx` searches via `admin.searchUsers`, then uses the selected identity with `admin.getWallet` + `admin.listLedgerEntries`; the internal user ID is no longer the primary lookup input.

**Implemented:**

1. In admin dashboard (F1), "Wallet view" section
2. Search by name/email/ID via `admin.searchUsers`, select a user, then call `admin.getWallet` → shows balance (total/held/available)
3. Ledger entries: paginated, filterable by entry type, date range, booking ID
4. Calls `admin.listLedgerEntries`

**Acceptance:**

- Admin searches user → sees wallet balance
- Admin views ledger → paginated, filterable
- Non-admin → 403

---

### F12: Admin Room Approval UI

**PRD:** FR-22

**Current state:** **CLOSED (2026-09-02).** The Room approvals tab includes an Active rooms catalog backed by `room.list` and an Add room dialog backed by `room.create`, with name/location trimming, positive whole-number capacity validation, and shared room-list cache invalidation after success. It also consumes `room.listPendingApprovals` as the cross-booking queue. Requested rooms can be assigned inline; Choose room/Choose another navigates to the admin booking detail Offline room card, where assignment, relocation, and cancellation use the booking's existing context. No pending or detail flow requires admins to paste a booking UUID. Existing room mutations remain the action paths.

**Required (after G14 backend):**

1. In admin dashboard, room approval queue for offline bookings in `awaiting_admin_room_approval`
2. Actions: approve room, relocate room (select from available), cancel room
3. Calls `room.assign`, `room.relocate`, `room.cancelBooking`
4. Notifies tutor + students (via G17)

**Acceptance:**

- Admin sees room approval queue
- Approve → booking scheduled
- Relocate → booking updated, notified
- Cancel room → room freed, booking continues

---

### F13: Tutor Payout View

**Status: CLOSED (REVIEW-FIXES-3 P6)** — payout details card on the tutor dashboard (completed sessions, total Marks, Cogito take, tutor payout + Rp 7,000 conversion) backed by `tutor.getMyPayouts`.

**PRD:** DL-11

**Current state:** **CLOSED (2026-08-19).** Payout details card on the tutor dashboard (completed sessions, total Marks, Cogito take, tutor payout + Rp 7,000 conversion) backed by `tutor.getMyPayouts` (`tutor-dashboard-page.tsx:53`).

**Required (backend ready):**

1. New route or section in tutor dashboard: "My payouts"
2. Calls `tutor.getMyPayouts` with date range
3. Shows: total completed sessions, total Marks earned, Cogito's take, tutor's payout amount (Marks × Rp 7,000)
4. Admin version: `admin.getTutorPayouts` for any tutor

**Acceptance:**

- Tutor sees own payouts with correct split (after G19 fix)
- Admin sees any tutor's payouts
- Cancelled sessions not included

---

### F14: Group Series No Opt-Out Disclaimer

**Status: CLOSED (REVIEW-FIXES-3 P6)** — booking detail renders the backend `disclaimer` (group-series no-opt-out) in a warning callout for tutor and student viewers.

**PRD:** FR-20, prd.tex:895-901

**Current state:** **CLOSED (2026-08-19).** Booking detail renders the backend `disclaimer` (group-series no-opt-out) in a warning callout for tutor and student viewers (`booking-detail-page.tsx:304`).

**Required (after G15 backend):**

1. On group series booking creation/confirmation, display disclaimer: "This is a full-series commitment. Once confirmed, you cannot opt out of this series. Individual sessions missed after the H-2 cutoff are non-refundable. By proceeding, you confirm you are available for all listed dates and times."
2. On invitee acceptance screen: show all session dates/times, per-student price, total Marks hold, disclaimer, accept/decline
3. Block any "cancel individual session" attempt for group series with the disclaimer

**Acceptance:**

- Group series creation shows disclaimer
- Invitee sees disclaimer before accepting
- Cancel individual session → blocked with message

---

### F15: Knowledge Bank Gating Flow (Full)

**PRD:** FR-12, DL-16

**Current state:** **CLOSED (2026-08-23; tutor/admin access expanded 2026-09-01).** The authenticated Knowledge Bank route uses the server-side `wallet.knowledgeBankEligible` rule. Eligible students (at least 35 total Marks), all authenticated tutors, and all authenticated admins see published Sanity resource metadata and protected PDF previews; below-threshold students remain in the app with a top-up CTA.

**Required:**

1. Verify the "Open Knowledge Bank" button links to the authenticated `/knowledge-bank` route
2. User-facing copy must say: "Knowledge Bank access requires at least 35 Marks in your wallet. You are not paying 35 Marks to open it." (DL-16)
3. If below 35 Marks: show "Top up your wallet to unlock the Knowledge Bank" with link to balance/top-up
4. Opening Knowledge Bank must NOT deduct Marks (verify no deduction entry created)

**Acceptance:**

- Student with ≥35 Marks → can open Knowledge Bank, no deduction
- Student with <35 Marks → blocked, prompted to top up
- Tutor with 0 Marks → can open Knowledge Bank and protected files, no threshold
- Admin with 0 Marks → can open Knowledge Bank and protected files, no threshold
- Copy is parent-legible (prd.tex:315)
- Resource files are streamed through the authenticated app server; Sanity asset URLs are not exposed to the browser

---

### F16: Achievements Public Landing Surfacing

**Status: SCOPE RETIRED (2026-08-23)** — the app no longer exposes a public landing page; `/` redirects directly to `/login` and the legacy landing component is archived. The public `achievement.listApproved` procedure remains available for a future public surface.

**PRD:** FR-18

**Current state:** **SCOPE RETIRED (2026-08-23).** The former app landing page was archived because the digital app starts at authentication. `achievement.listApproved` remains implemented, but no active app route consumes it.

**Required:**

1. Public landing page (or section) showing approved achievements
2. Calls a public endpoint to list approved achievements (may need new public route in achievement router)
3. Display: title, category, summary, student name, date

**Acceptance:**

- Approved achievements visible on public page
- Rejected/pending not shown publicly
- Student sees own rejected with reason (existing)

---

### F17: Booking Detail Page (Full)

**PRD:** FR-07, FR-08, FR-14, FR-15, FR-21

**Current state:** **CLOSED (2026-08-19; UX follow-up 2026-08-24; manual fallback follow-up 2026-08-27).** The booking detail route implements student/tutor state, schedule, participants, Marks, meeting/room access, history, cancellation, tutor review/completion, group invitation/reconfirmation, reschedule proposal/decision, lateness reporting with ticket status, and post-session notes. Its responsive task-detail presentation now prioritizes status, schedule, format/access, visible participant identities, and role-appropriate primary booking actions directly below the status badge; contextual actions remain above Marks or in the main flow. Participant rows show saved images or initials, names, roles, and confirmation states; online meeting-pending/failed states explain when the link is generated and when retries are active, while an available meeting URL is opened from the compact meeting-status popover instead of a `Ready` badge or standalone CTA. Tutor review uses a compact responsive accept/decline dialog with a session summary before the existing mutation is submitted. When automatic meeting setup is unavailable, the assigned tutor can add or replace a trusted URL for an online `confirmed`/`scheduled` booking through a shared Selia dialog; admins retain the operations fallback. The desktop overview/activity flow now stays in an independent left column from the sticky Actions/Marks rail, preventing the rail height from creating a blank row before Activity; narrow layouts retain the overview → actions/Marks → Activity order. Backend guards reject offline, terminal, pre-confirmation, and wrong-tutor requests. Admin review and override actions remain on the dedicated admin operations surface. The manual-link follow-up adds `tutorActions.setMeetingLink` and keeps the booking state machine unchanged.

**Required:**

1. New route `/_app/bookings/$bookingId` — booking detail
2. Shows: booking state, type, tutor, participants, scheduled time, meeting link (if created), room (if offline), price, hold amount, state history timeline
3. Student actions: cancel (pre-H-2), report lateness (F3), accept/reject reschedule (F7)
4. Tutor actions: accept/decline (existing in tutor-bookings), propose reschedule (F6), complete session (F8), add session notes (F9), add/replace a manual meeting link when automatic setup is unavailable
5. Meeting link visible only after all confirmations (G11 backend); pending/failed provider states explain generation timing and retry behavior; manual-link entry is limited to online `confirmed`/`scheduled` bookings and authorized tutor/admin roles
6. State history: timeline of all transitions with timestamps and actors

**Acceptance:**

- Clicking a booking in list → opens detail
- All role-appropriate actions visible
- Meeting link gated by confirmation state
- State history visible

---

### F18: Group Invite Accept/Decline/Reconfirm UI

**PRD:** FR-20, TC-25

**Current state:** **CLOSED (2026-08-22).** `confirmInvite`/`declineInvite`/`reconfirm` are wired in `booking-lifecycle-actions.tsx` (merged via #55). The proposer now sees pending invitees and can withdraw one through an in-app confirmation dialog backed by `booking.withdrawInvite`. The no-opt-out disclaimer is covered by F14.

**Required:**

1. Invitee view showing: all session dates/times, per-student price, total Marks hold, full-series no-opt-out disclaimer (per TC-25 / F14), accept/decline actions
2. Accept → calls `booking.confirmInvite`
3. Decline → calls `booking.declineInvite`
4. Reconfirm flow for invitees whose attendance confirmation expires → calls `booking.reconfirm`
5. Inviter-side withdraw for a pending invite → calls `booking.withdrawInvite`; marks only that invitee `withdrawn_pre_h2`, keeps headcount/holds unchanged, and notifies the invitee
6. Post-action states rendered (confirmed/pending/declined/withdrawn) in both the group booking detail and the invitee's booking list

**Acceptance:**

- Invitee can accept/decline a group invite and sees schedule + price + hold + disclaimer first
- Reconfirmation prompt appears when needed
- Inviter can withdraw a pending invite without affecting confirmed participants or Marks holds
- No `confirmInvite`/`declineInvite`/`reconfirm`/invite-withdraw gaps remain in `apps/web`

---

### J2: Session Expiry UX

**PRD:** J2 (foundation-hardening), session expiry (7 days)

**Current state:** **CLOSED (2026-08-22).** `SessionExpiryNotice` is mounted in the authenticated shell, warns during the final 30 minutes, and redirects through the existing `reason=session-expired` fallback when the session is gone.

**Required:**

1. Pre-expiry UX: countdown/warning toast before the session expires (e.g., at the 7-day session TTL boundary)
2. On expiry: clear cached queries, show "Session expired" notice, redirect to `/login` with a return path
3. Avoid data loss: block/queue in-flight mutations on expiry with a clear message

**Acceptance:**

- User is warned before the session expires instead of a hard redirect on the next request
- Expired session → redirected to login with reason shown
- No stale client cache survives logout/expiry

---

### Dead Components Cleanup

**Current state:** **CLOSED (2026-08-22).** The previously unused components were removed after a repo-wide importer check; no references remain in `apps/web`:

- `chart.tsx`, `data.ts`, and `user-menu.tsx`

**Required:**

1. Verify zero importers with a repo-wide search before deleting
2. Remove the dead files and any orphaned exports they reference
3. Keep `mode-toggle.tsx` if referenced by the sidebar; otherwise add it to this list

**Acceptance:**

- No `chart.tsx` / `data.ts` / `user-menu.tsx` references remain in `apps/web`
- `check-types` and `bun run build` pass after removal

---

## Implementation Pattern

Follow existing frontend conventions:

1. **Route file:** `apps/web/src/routes/_app.{feature}.tsx` (TanStack Router file-based)
2. **Page component:** `apps/web/src/components/dashboard/pages/{feature}-page.tsx`
3. **Sub-components:** `apps/web/src/components/{section}/{component}.tsx`
4. **Data fetching:** TanStack Query via `orpc.{module}.{method}.queryOptions({ input })`
5. **Mutations:** `orpc.{module}.{method}.mutationOptions({ onSuccess, onError })`
6. **UI:** Selia components from `@cogito-app/ui/components/selia/*` (see AGENTS.md)
7. **Toast:** `sonner` for success/error notifications
8. **Forms:** TanStack Form (`@tanstack/react-form`) with Zod validation

### Selia Components Available

Card, Button, Badge, Heading, Text, Stack, Input, Textarea, NumberField, DatePicker, Field, Select, Menu, Popover, Drawer, Table, Item, Avatar, Divider, Separator, Checkbox, Chip, IconBox, InputGroup, Kbd, Sidebar, Spinner, Toast. See AGENTS.md for full list + import paths.

---

### Version Notes

- v1.64 (2026-09-02): Matched the student achievement summary cards to the admin moderation queue's compact label-and-pill treatment; no RPC/schema/persistence contract changed.

- v1.63 (2026-09-02): Made the student and admin achievement `TableContainer` full-bleed within `CardBody` so the table aligns with both card edges; the inner container retains horizontal scrolling and the page remains constrained. No RPC/schema/persistence contract changed.

- v1.62 (2026-09-02): Moved non-essential achievement metadata and row actions into a shared right-side detail drawer for student and admin tables. The compact tables retain core identifiers, status, awarded date, and a keyboard-accessible detail trigger; no RPC/schema/persistence contract changed.

- v1.61 (2026-09-02): Constrained the student and admin achievement table wrappers with `min-w-0`/`max-w-full` so the card and page remain within the viewport; only the minimum-width table content scrolls horizontally. No RPC/schema/persistence contract changed.

- v1.60 (2026-09-02): Replaced the student achievement card list and admin moderation card grid with minimum-width Selia tables. Both lists keep their existing row actions and links, scroll horizontally inside their containers on narrow viewports, and leave all RPC/schema/persistence contracts unchanged.

- v1.59 (2026-09-02): Added the admin Active rooms catalog and Add room dialog to the Room approvals tab. The dialog calls the existing `room.create` mutation, validates name/location/capacity, and refreshes room selectors after a successful create; no API or schema contract changed.

- v1.58 (2026-09-02): Refined admin offline room assignment into a Room approvals queue plus context-aware booking-detail actions. Removed manual booking UUID/date-time entry; assign, relocate, and cancellation now use the selected booking's existing schedule and room context.

- v1.57 (2026-09-02): Replaced the admin wallet lookup's exact user-ID input with an admin-only identity search by name, email, or user ID. Results are bounded and selectable, and wallet/ledger reads run only for the selected account. Added the `admin.searchUsers` RPC and updated the admin API/module/runbook references.

- v1.56 (2026-09-01): Limited tutor short bios to 50 whitespace-delimited words, added a live word counter and matching API validation, and updated achievement/experience proof guidance to recommend one shared Google Drive folder with the “Anyone with the link can view” setting. The RPC shape and database schema are unchanged.

- v1.55 (2026-09-01): Standardized every role on Better Auth `user.name`, removed the tutor-profile name input/payload from onboarding, switched tutor search and visible tutor surfaces to the user record, and retained `tutorProfile.displayName` only as legacy compatibility data. No schema field was removed.

- v1.55 (2026-09-01): Combined the tutor Education, Competition achievements, and Experiences public previews into one preview inside the shared Achievements & experience card. No RPC, schema, or persistence contract changed.

- v1.54 (2026-09-01): Unified tutor profile scrolling with the authenticated shell's page-level scroller to match the student profile, prevented direct page children from flex-shrinking below the form's natural height, removed the nested form scrollbar, and returned the final action card to normal document flow to eliminate trailing scroll space. No RPC, schema, or persistence contract changed.

- v1.53 (2026-09-01): Grouped tutor education, competition achievements, experiences, and their separate proof-link fields into one combined Achievements & experience profile card. No RPC, schema, or persistence contract changed.

- v1.52 (2026-09-01): Set independent Manage Tutors page sizes to 3 invitations and 5 tutor profiles while retaining separate pagination state. No RPC, schema, or persistence contract changed.

- v1.51 (2026-09-01): Fixed the Manage Tutors invitation-table badge mapping so invited is warning, accepted is success, and expired/revoked are danger, with a secondary fallback for unknown values. No RPC, schema, or persistence contract changed.

- v1.50 (2026-09-01): Granted tutors and admins Knowledge Bank access without the student 35-Mark wallet threshold across the sidebar, route guard, resource list, and protected file proxy; students retain the existing threshold. Added role-specific API, module, runbook, and regression coverage.

- v1.48 (2026-09-01): Capped tutor profile subject selection at 7 active child subjects, added explicit frontend submit validation, and kept the API limit aligned with the selector. Updated the tutor taxonomy smoke check and module/API references.

- v1.49 (2026-09-01): Preserved in-progress comma punctuation in the structured tutor achievement editor while keeping comma-separated awards normalized for the existing payload; documented punctuation coverage for achievement and experience text. No API, schema, or persistence contract changed.

- v1.46 (2026-08-31): Made the post-login destination role/onboarding-aware: incomplete or changes-requested tutors go to `/profile`, tutors past onboarding and admins go to `/dashboard`, and the selected destination is preserved through email verification. No API or schema contract changed.

- v1.47 (2026-09-01): Switched R2 uploads from unsupported multipart-form POST to presigned PUT, added exact content-length input/signing, fixed local raw-body upload credentials for the tutor flow, and configured bucket CORS for browser uploads.

- v1.44 (2026-08-31): Made the shared Selia `Drawer.Content` the sole vertical scroll container for student tutor discovery and admin tutor-review drawers, kept profile headers/action footers outside that scroll area, and contained body overscroll so it cannot move the fixed regions. No RPC, schema, or persistence contract changed.

- v1.45 (2026-08-31): Replaced the student account image URL input with a JPG/PNG/WebP upload flow, added circular drag/zoom cropping to a 512px square JPEG, and wired the result through the existing protected upload URL plus Better Auth account save. No new RPC, schema, or persistence contract.

- v1.42 (2026-08-31): Contained tutor `/profile` scrolling to one route-owned vertical scroller, removed the action-bar bottom gap, and kept subject-category fieldsets at natural heights. No RPC, schema, or persistence contract changed.

- v1.40 (2026-08-31): Tightened CI coverage enforcement so `packages/api` lines, overall lines, overall functions, and overall branches must each reach 100% from the shared lcov artifact. The 0/0 branch case is treated as 100%; no runtime or API contract changed.
- v1.43 (2026-08-31): Replaced the tutor Experiences text area with one structured repeatable section backed by up to five `experienceEntries`, added start/end-year validation without grouping separators, kept legacy `experiences` text as a fallback, exposed the structured entries in discovery/admin review, and added migration `0040_colossal_morlun.sql`.
- v1.41 (2026-08-31): Simplified tutor profile input to one structured Achievements section plus one Experiences field, kept legacy achievement text as a fallback, and disabled grouping separators in competition-achievement years. The submit validator accepts either structured competition achievements or legacy achievement text.
- v1.39 (2026-08-31): Kept profile contact-privacy and tutor-onboarding validation parts under Selia `Field` roots, including structured-achievement section errors, so Base UI error #28 cannot turn an inline validation state into a generic client-side 500. No RPC, schema, persistence, or URL contract changed.
- v1.38 (2026-08-31): Added structured tutor education and competition achievements with 2/5 entry caps, bold-first-line public rendering, legacy `credentialsSummary` fallback, migration `0039_secret_blink.sql`, and admin correction through `adminTutor.updateTutorAchievements` with optimistic locking and audit logging.

- v1.37 (2026-08-28): Updated the shared `/bookings` page to consume the existing `booking.listMine` cursor contract in batches of 20 with an append-only **Load more bookings** flow. Existing cards stay visible during next-page loading, and tab counts show `+` while more pages remain. Mutation invalidation now targets the procedure key so all cached infinite pages refresh. No API or schema contract changed.
- v1.36 (2026-08-28): Stabilized server-backed collection transitions with TanStack Query `keepPreviousData` for admin tutor pagination, tutor discovery search/filters, and the admin booking queue. Admin tutor pagination scrolls to the selected table card by DOM ID and disables controls while loading. No RPC, schema, persistence, or URL search contract changed.
- v1.35 (2026-08-28): Kept the booking-detail overview/activity flow independent from the sticky desktop Actions/Marks rail so rail height cannot create a blank row before Activity; narrow layouts retain actions/Marks before Activity. No RPC, schema, or persistence contract changed.
- v1.34 (2026-08-28): Added paint-safe tab-scroller padding and overflow-safe empty-state/card boundaries for the shared bookings page, including an E2E narrow-viewport regression. No RPC, schema, or persistence contract changed.
- v1.32 (2026-08-27): Improved admin tutor review readability by mapping pending subject IDs to active category/subject labels and wrapping long pending values. No RPC, schema, or persistence contract changed.
- v1.31 (2026-08-27): Added the assigned-tutor `tutorActions.setMeetingLink` fallback plus a shared Selia manual-link dialog for tutor booking detail and admin operations. The fallback is limited to online `CONFIRMED`/`SCHEDULED` bookings, updates the active meeting-attempt row, and keeps force-majeure handling on the auditable admin override path. No schema change.
- v1.28 (2026-08-26): Added the authenticated shell's `D` keyboard shortcut for toggling the rendered light/dark theme outside editable fields, while retaining the Light/Dark/System menu and `next-themes` persistence. No API, schema, or persistence contract changed.
- v1.30 (2026-08-26): Constrained the shared booking status-tab strip to the available mobile width and kept horizontal tab scrolling inside a scrollbar-hidden region. No RPC, schema, or persistence contract changed.
- v1.25 (2026-08-25): Added the Selia `Spinner` component to the local UI package and composed it inside a token-based loading ring with a visible label and reduced-motion-safe static fallback across router, onboarding, and auth loading states. No API or persistence contract changed.
- v1.26 (2026-08-26): Added a reusable compact `IconInfoSquareRounded` preview trigger for booking-detail helper copy. Meeting-room readiness, missing offline-room details, unavailable meeting-link explanations, retry/admin setup status, and completion timing now disclose through the accessible Selia popover on hover, focus, click, or touch. No RPC, schema, or persistence contract changed.
- v1.29 (2026-08-26): Moved the available online meeting action into the meeting-status popover and removed the standalone `Ready` badge/Google Meet CTA. Online meeting status now uses the same compact info trigger whether the URL is pending or available. No RPC, schema, or persistence contract changed.
- v1.24 (2026-08-25): Added the shared Selia `aria-invalid` danger outline to auth inputs and ensured empty submit attempts reveal every invalid auth field without changing the auth API or persistence contract.
- v1.23 (2026-08-25): Standardized collection empty states through the shared Selia presentation component with `default`, `compact`, and `inline` densities. Covered calendar periods, discovery filters, booking/detail sections, notifications, ledgers, subject/proof-link fields, availability previews, and admin tables. No RPC, schema, or persistence contract changed.
- v1.22 (2026-08-25): Added field-level login/sign-up validation on change and blur, visible password requirements, accessible Selia inline field errors, and client-side name/email normalization. No auth API or persistence contract changed.
- v1.21 (2026-08-24): Refined the notifications inbox with row selection, select-all for loaded rows, batch read/unread actions, human-readable category badges, exact date/time display, and a protected `notification.updateReadStatus` procedure scoped to the authenticated user. No notification schema change.

- v1.20 (2026-08-24): Moved eligible `Propose new time` and `Complete session` buttons into the booking-detail header action group beneath the state badge; removed their card-footer duplicates. Documented that the booking proposer may reschedule in `confirmed`/`scheduled` before H-2, while force-majeure exceptions require support/admin handling and an auditable override. No RPC, schema, or persistence contract changed.
- v1.19 (2026-08-24): Replaced the outer booking-detail overview flex-wrap with a responsive two-column grid for the merged `Date & time` and `Format & access` fields; the grid stacks on narrow screens while inner status/CTA content can still wrap. No RPC, schema, or persistence contract changed.
- v1.18 (2026-08-24): Merged the booking-detail date and session hours into one `Date & time` field with a calendar-clock icon, keeping Format & access as the second flex-wrapped overview field. No RPC, schema, or persistence contract changed.
- v1.17 (2026-08-24): Refined the booking-detail overview row so Date is date-only, Session time owns the hour display, Format & access shares the same flex-wrapped row, Participants uses the matching Selia `IconBox`, and desktop header actions align to the bottom of the right column beneath the status badge. No RPC, schema, or persistence contract changed.
- v1.15 (2026-08-24): Reduced booking-detail vertical density by replacing the full online meeting-pending/failed status panel with an accessible Selia info/warning icon popover. The popover retains the existing explanation and retry/admin setup badge; ready links and the meeting CTA are unchanged. No RPC, schema, or persistence contract changed.
- v1.13 (2026-08-24): Refined tutor availability controls so weekly minute-time fields share the compact start-field width with a centered range separator, suggestions can grow beyond the field, and modality triggers keep icons beside labels. This remains presentation-only; RPC, schema, and persistence contracts are unchanged.
- v1.14 (2026-08-24): Moved role-appropriate primary booking actions below the shared status badge. Tutor review keeps propose/decline/accept together; students see their available propose/cancel actions in the same header slot. Admins continue to use the dedicated operations and override workflow. No RPC, schema, or persistence contract changed.
- v1.12 (2026-08-23): Fixed the shared Selia portal layer for `DatePicker` and `SelectPopup` so achievement-form date, Category, Level, and calendar month/year controls remain above modal dialogs and clickable. No RPC, schema, or persistence contract changed.
- v1.16 (2026-08-24): Hardened email sign-in/sign-up transitions: await Better Auth success and a fresh session before navigation, suppress the overlapping auth-store refetch during the handoff, and make the authenticated parent guard use the fresh session. Added E2E coverage against an intermediate `/login` navigation. No auth API or persistence contract changed.
- v1.11 (2026-08-22): Moved available Booking actions above Marks in the sticky desktop rail while keeping session notes/support reports in the main content flow. Narrow layouts place actions and Marks before Activity. No booking API or state-machine contract changed.
- v1.10 (2026-08-22): Moved format/access and participant identity details into the booking detail overview. The overview keeps meeting/room access prominent, shows participant images/names/roles/statuses in a responsive list, and leaves only Marks in the sticky metadata rail. No booking API or state-machine contract changed.
- v1.10a (2026-08-22): Replaced app-level browser-native date/time/number/select/textarea controls with Selia wrappers and the shared minute-level date/time primitives. This is a UI-only refactor; RPC, schema, and state-machine contracts are unchanged.
- v1.9 (2026-08-22): Tutor discovery category and child-subject filters now support multi-select values with label-preserving triggers and normalized array filters.
- v1.8 (2026-08-22): Refined booking detail participants, Marks prefix, activity timeline, and online meeting status. The detail page uses profile images with initials fallback, a newest-first activity line with transition-specific icons and one destination-state badge, 30–60 second refresh while a meeting link is pending, and explicit copy for `confirmed` provider retries. The meeting providers now update the newest meeting-attempt row for manual-link fallback, and the booking read model never reports a URL-less row as `ready`.
- v1.7 (2026-08-22): Replaced booking cancel/complete browser confirmation prompts with Selia dialogs and raised the global toast layer above dialog overlays so mutation feedback remains visible. No booking API or state-machine contract changed.

- v1.6 (2026-08-22): Refined the F17 tutor booking review dialog with responsive sizing, a schedule/modality/attendance summary, modality-aware transition copy, and mobile-friendly action layout. No booking API or state-machine contract changed.

- v1.5 (2026-08-19): Re-audited against main `d11962b` (PR #55 merged). F2/F3/F6/F7/F11/F17 → **Closed** (merged); F8/F13/F14/F16 confirmed **Closed** in code; F1/F9/F12 remain **Partial** (no admin state-history detail view, no rich-text toolbar, no dedicated room-approval queue); F18 → **Partial** (inviter-side `withdraw` UI still missing); J2 → **Open**; dead components (`chart.tsx`/`data.ts`/`user-menu.tsx`) still present with 0 importers.
- v1.4 (2026-08-16): Reconciled PR #55 with merged PRs #59, #61, #62, and #63. Resolved migration numbering and achievement-contract blockers, retained F18/J2/dead-component audit coverage, removed temporary QA artifacts, and kept the remaining frontend gaps explicit pending final CI.
- v1.3 (2026-08-16): Wave-3 P2 executed — full blocker report posted on PR #55 ([comment 5306378534](https://github.com/cogitoacademy/app/pull/55#issuecomment-5306378534)) covering the red CI (TS6133 `proposedEndAt` at `booking.service.ts:1407`), migration 0020 achievement-column schema mismatch, undeclared F18/J2/dead-components section deletions, stray `.qa-marks-before/` + `artifacts/` at repo root, and the backend surface riding the PR (multiparty reschedule, `studentProcedure`, admin-tutor edit review, migrations 0019/0020/0021). Blockers remain with the branch author; PR #55 is not mergeable until resolved.
- v1.2 (2026-08-16): Re-audited against open PR #55 (`f/frontend-prd-gaps`, 25 commits). Marked F2/F3/F6/F7/F11/F17 as covered by the PR (Closed* = pending merge), F1/F9/F12 as partial-after-PR, and corrected F13's backend note (`tutor.getMyPayouts` exists since #43). Flagged the PR's blockers (red CI unused `proposedEndAt`; migration 0020 achievement-column schema mismatch; undeclared F18/J2/dead-components section deletions) — tracked in REVIEW-FIXES-3 P2. Still open after PR #55: F8, F13, F14, F16, F18-withdraw, J2, dead-components cleanup.
- v1.1 (2026-08-14): Full frontend audit at `apps/web` git HEAD `9b7df5e`. Corrected the "Current Frontend State" routes table (was stale — e.g. notifications page existed). Statuses updated: F4, F5, F10, F15 → **Closed**; F8, F16, F17 → **Partial**; F1-F3, F6, F7, F9, F11-F14 → **Missing**. Added gaps F18 (group invite accept/decline/reconfirm UI), J2 (session expiry UX), and a dead-components cleanup note. Effort revised from ~20d to ~15d for the remaining ~10 gaps.
- v1.0 (2026-07-29): Created. 17 frontend gaps catalogued (F1-F17) with PRD references, backend dependencies, and acceptance criteria. Derived from PRD §Product Surfaces and audit of `apps/web/src/`. Runs parallel with backend PRD-GAPS-SPEC.md.

### Tutor drawer scroll follow-up (2026-09-01)

Student discovery and admin tutor-review drawers now give `Drawer.Content` the
single vertical scroll region. Headers and action footers stay outside that
region, while local body overscroll remains contained. No RPC, schema, or
persistence contract changed.
