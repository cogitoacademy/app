# Cogito Frontend — PRD Gaps Specification

| Field      | Value                                         |
| ---------- | --------------------------------------------- |
| Status     | Living gap inventory (updated 2026-08-16)     |
| Branch     | `f/frontend-prd-gaps` (open PR #55)           |
| Created    | 2026-07-29                                    |
| Audited    | 2026-08-16                                    |
| Depends on | Backend PRD gaps (G1-G19) where API is needed |
| Scope      | Frontend only (`apps/web/`)                   |

This document catalogs all PRD-required frontend surfaces that are not yet implemented. It runs in parallel with (or after) the backend PRD gaps spec — each frontend gap references the backend gap it depends on.

The backend spec is `docs/plans/completed/PRD-GAPS-SPEC.md` (backend-only). This is the frontend counterpart.

---

## Current Frontend State

### Existing routes (`apps/web/src/routes/`)

| Route                        | Component                       | Status                               |
| ---------------------------- | ------------------------------- | ------------------------------------ |
| `/` (index)                  | index.tsx (marketing landing)   | Exists                               |
| `/login`                     | login.tsx (sign-in-form)        | Exists                               |
| `/invite`                    | invite.tsx (invite-claim)       | Exists                               |
| `/auth/callback`             | auth.callback.tsx               | Exists                               |
| `/_app`                      | _app.tsx (App layout + sidebar) | Exists                               |
| `/_app/dashboard`            | _app.dashboard.tsx              | Exists (static stats)                |
| `/_app/balance`              | _app.balance.tsx                | Exists (wallet + Knowledge Bank)     |
| `/_app/bookings`             | _app.bookings.tsx               | Exists (list + cancel)               |
| `/_app/bookings/$bookingId`  | _app.bookings_.$bookingId.tsx   | Exists (student + tutor detail)      |
| `/_app/tutors`               | _app.tutors.tsx                 | Exists (discovery)                   |
| `/_app/tutors/$tutorId/book` | _app.tutors_.$tutorId.book.tsx  | Exists (solo/group/series creation)  |
| `/_app/achievements`         | _app.achievements.tsx           | Exists (submission + list)           |
| `/_app/profile`              | _app.profile.tsx                | Exists (incl. parent contact fields) |
| `/_app/notifications`        | _app.notifications.tsx          | Exists (full page — see F10)         |
| `/_app/onboarding`           | _app.onboarding.tsx             | Exists (tutor onboarding)            |
| `/_app/tutor-bookings`       | _app.tutor-bookings.tsx         | Exists (incoming list + review link) |
| `/_app/availability`         | _app.availability.tsx           | Exists (weekly + one-time slots)     |
| `/_app/admin-tutors`         | _app.admin-tutors.tsx           | Exists (admin tutor invite + review) |
| `/_app/admin-achievements`   | _app.admin-achievements.tsx     | Exists (moderation UI)               |
| `/_app/admin`                | —                               | **Missing** (F1)                     |

### Remaining gaps (no complete surface yet)

The PRD §Product Surfaces and Permissions (prd.tex:317-375) defines required screens. The following are **not implemented**:

---

## Frontend Gap Summary

| #   | Gap                                           | PRD Ref                | Depends on (backend)                        | Effort | Status  |
| --- | --------------------------------------------- | ---------------------- | ------------------------------------------- | ------ | ------- |
| F1  | Admin dashboard + override queue              | FR-10, OQ-04           | G8, G9, G10                                 | 3d     | Missing |
| F2  | Admin override form with before/after preview | FR-10, prd.tex:717-728 | G10                                         | 2d     | Closed* |
| F3  | Report tutor lateness/no-show button          | FR-14, DL-26           | G1                                          | 1d     | Closed* |
| F4  | Competition Calendar link                     | FR-11                  | None (external link)                        | 0.5d   | Closed  |
| F5  | WhatsApp support button                       | FR-14, OQ-04           | None (external link)                        | 0.5d   | Closed  |
| F6  | Tutor reschedule proposal UI                  | FR-15                  | G6                                          | 1d     | Closed* |
| F7  | Student reschedule approval UI                | FR-15                  | G6                                          | 1d     | Closed* |
| F8  | Series session completion UI                  | FR-20                  | G18                                         | 1d     | Partial |
| F9  | Session notes (rich-text) view + add          | FR-09, DL-18           | G7                                          | 1.5d   | Partial |
| F10 | Notifications page                            | FR-17                  | G17                                         | 1.5d   | Closed  |
| F11 | Admin wallet/ledger view                      | FR-10                  | G9                                          | 1d     | Closed* |
| F12 | Admin room approval UI                        | FR-22                  | G14                                         | 1d     | Partial |
| F13 | Tutor payout view                             | DL-11                  | G16 (`tutor.getMyPayouts` exists since #43) | 0.5d   | Missing |
| F14 | Group series no opt-out disclaimer display    | FR-20                  | G15                                         | 0.5d   | Missing |
| F15 | Knowledge Bank gating flow (full)             | FR-12                  | None (wallet.knowledgeBankEligible exists)  | 0.5d   | Closed  |
| F16 | Achievements public landing surfacing         | FR-18                  | Needs new public achievement list procedure | 1d     | Partial |
| F17 | Booking detail page (implemented baseline)    | FR-07, FR-08           | G6, G11                                     | 2d     | Closed* |

**Total estimated effort: ~15 days for remaining gaps (F1-F3, F6-F9, F11-F14, F16-F17 partial; F4, F5, F10, F15 are done).**

> **Audit 2026-08-14:** F4, F5, F10, F15 verified **closed** in `apps/web` (git HEAD `9b7df5e`). F8, F16, F17 remain partial. All remaining missing gaps have backend procedures ready except F13 (needs new `tutor.getMyPayouts` router) and F16 (needs a new public achievement list procedure).

> **Audit 2026-08-16 (against open PR #55 `f/frontend-prd-gaps`):** The open PR delivers F2, F3, F6, F7, F11, F17 (marked **Closed*** = implemented in the PR, pending merge) and partial F1/F9/F12/F15. After it merges, still open: **F8** (per-session series completion — UI has no session list/`sessionId`), **F13** (tutor payout view; backend `tutor.getMyPayouts` **exists since #43** — the old "router does not exist" note was stale), **F14** (group-series no-opt-out disclaimer display — backend constant only), **F16** (public achievements; no public procedure exists), plus F18 inviter-side `withdraw` UI, J2 proactive session-expiry UX, and the dead-components cleanup (`chart.tsx`, `data.ts`, `user-menu.tsx` still present). ⚠ The PR carries blockers (red CI: unused `proposedEndAt` at `booking.service.ts:1407`; migration 0020 renames achievement columns but `schema/achievement.ts`/repo still use `imageUrl`/`eventDate` — would break achievement CRUD) — see REVIEW-FIXES-3 P2.

---

## Detailed Gap Specifications

### F1: Admin Dashboard + Override Queue

**PRD:** FR-10 (Admin Override), OQ-04 (SLA escalation), prd.tex:717-728

**Current state:** No admin dashboard route exists. Only `_app.admin-tutors` (tutor invite + review). No booking monitor, no override queue, no urgency sorting.

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

**Current state:** `applyOverride` endpoint exists but no UI.

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

**Current state:** Implemented in open PR #55 (`booking-lifecycle-actions.tsx`: `canReportLateness` student + ≥15 min after start → `support.createTicket`; ticket status on booking detail). Pending merge.

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

**Current state:** **CLOSED (2026-08-14).** Competition Calendar link is present in the authenticated sidebar, on the dashboard, and on the marketing landing page. No work remains; kept here for the record.

**Required:**

1. Student dashboard: add Competition Calendar entry/link to `cogitoacademy.id/en/calendar`
2. Public landing page: link to calendar (if public site is part of this app)
3. No Marks condition — any signed-in student can open it

**Acceptance:**

- Student dashboard has visible Competition Calendar link
- Clicking opens external calendar at `cogitoacademy.id/en/calendar`

---

### F5: WhatsApp Support Button

**PRD:** FR-14, OQ-04, prd.tex:1260

**Current state:** **CLOSED (2026-08-14).** WhatsApp support link (`wa.me/6288101190195`) is present in the authenticated sidebar, on the dashboard, and on the marketing landing page. No work remains; kept here for the record.

**Required:**

1. Add WhatsApp support button to student dashboard sidebar or footer
2. Links to `https://wa.me/6288101190195` (or equivalent wa.me link for +62 881-0119-90195)
3. Visible to all authenticated users

**Acceptance:**

- WhatsApp button visible on dashboard
- Clicking opens WhatsApp with the support number

---

### F6: Tutor Reschedule Proposal UI

**PRD:** FR-15

**Current state:** Implemented in open PR #55 (`booking-reschedule-action.tsx`: calendar + time input + reason; `booking.proposeReschedule` tutor-or-proposer, per-session `sessionId`, supersedes pending proposal; backend `proposeReschedule` moved to booking.router). Pending merge.

**Required (after G6 backend fix):**

1. On tutor booking detail (`_app.tutor-bookings`), add "Propose reschedule" action for bookings in `confirmed`/`scheduled` state
2. Form: new date/time picker, reason (optional)
3. Calls `booking.proposeReschedule` (tutor role, after G6 fix)
4. Shows pending status after submission

**Acceptance:**

- Tutor can propose new time → booking enters `reschedule_proposed`
- Student notified (via G17 notification matrix)

---

### F7: Student Reschedule Approval UI

**PRD:** FR-15

**Current state:** Implemented in open PR #55 (`booking-lifecycle-actions.tsx`: accept/reject with `proposalId`, multiparty `decisions` voting — unanimous required, restore pre-proposal state; backend `acceptReschedule`/`rejectReschedule` rewritten for multiparty). Pending merge.

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

**PRD:** FR-20

**Current state:** **PARTIAL (2026-08-16).** Tutor booking detail has a single whole-booking complete-session button; there is **no per-session list** and no `sessionId` passed, so series completion fails (`BookingSessionRequiredError`). Backend `completeSeriesSession`/`completeSession({sessionId})` is ready (solo + group series, per-session deduction). NOT covered by PR #55.

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

**Current state:** **PARTIAL (2026-08-16).** Open PR #55 adds a notes list + textarea on completed bookings, rendered via `dangerouslySetInnerHTML` with **server-side** `sanitizeHtml` (backend `packages/api/src/lib/sanitize.ts`). No rich-text toolbar editor (headings/lists/emphasis) and no client-side DOMPurify — FR-09's formatting requirements are only partially met.

**Required (after G7 backend):**

1. On booking detail (after session completed), "Add session note" section
2. Rich-text editor supporting: paragraphs, headings, bullet lists, numbered lists, links, bold, italic
3. Sanitize on render (DOMPurify)
4. "View notes" section showing all notes from both parties
5. Only visible after session is completed

**Acceptance:**

- Tutor adds note with formatting → renders correctly
- Student views notes → sees formatted content
- XSS attempt → sanitized

---

### F10: Notifications Page

**PRD:** FR-17

**Current state:** **CLOSED (2026-08-14).** Full `/_app/notifications` page exists at `apps/web/src/routes/_app.notifications.tsx`: cursor pagination, read/unread states, mark-all-read, and unread count in the sidebar bell. Only the optional category filter remains unimplemented (nice-to-have, not a PRD blocker).

**Required:**

1. New route `/_app/notifications` — full notification list
2. Calls `notification.list` with cursor pagination
3. Show: title, body, category badge, read/unread state, timestamp, booking link
4. "Mark as read" per notification + "Mark all as read"
5. Unread count badge in sidebar (already has `notification-bell.tsx`)
6. Filter by category (optional)

**Acceptance:**

- Notifications page lists all notifications
- Mark as read works
- Unread badge updates

---

### F11: Admin Wallet/Ledger View

**PRD:** FR-10

**Current state:** No admin wallet view. Backend G9 not implemented.

**Required (after G9 backend):**

1. In admin dashboard (F1), "Wallet view" section
2. Search by user → calls `admin.getWallet` → shows balance (total/held/available)
3. Ledger entries: paginated, filterable by entry type, date range, booking ID
4. Calls `admin.listLedgerEntries`

**Acceptance:**

- Admin searches user → sees wallet balance
- Admin views ledger → paginated, filterable
- Non-admin → 403

---

### F12: Admin Room Approval UI

**PRD:** FR-22

**Current state:** No admin room approval UI. Backend G14 not implemented.

**Required (after G14 backend):**

1. In admin dashboard, room approval queue for offline bookings in `awaiting_admin_room_approval`
2. Actions: approve room, relocate room (select from available), cancel room
3. Calls `admin.approveRoom`, `admin.relocateRoom`, `admin.cancelRoom`
4. Notifies tutor + students (via G17)

**Acceptance:**

- Admin sees room approval queue
- Approve → booking scheduled
- Relocate → booking updated, notified
- Cancel room → room freed, booking continues

---

### F13: Tutor Payout View

**PRD:** DL-11

**Current state:** No payout view in `apps/web`. Backend `tutor.getMyPayouts` **exists** since #43 (`tutor.router.ts:93-103`); `admin.getTutorPayouts` exists. Frontend UI is the only missing piece.

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

**PRD:** FR-20, prd.tex:895-901

**Current state:** No disclaimer displayed. Backend G15 not implemented.

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

**Current state:** **CLOSED (2026-08-14).** `balance-page.tsx` shows the exact DL-16 copy and gates the Knowledge Bank behind eligibility computed client-side via `totalBalance >= 35`. No Marks deduction. Backend `wallet.knowledgeBankEligible` exists but is unused by the UI.

**Required:**

1. Verify the "Open Knowledge Bank" button links to the external Knowledge Bank URL
2. User-facing copy must say: "Knowledge Bank access requires at least 35 Marks in your wallet. You are not paying 35 Marks to open it." (DL-16)
3. If below 35 Marks: show "Top up your wallet to unlock the Knowledge Bank" with link to balance/top-up
4. Opening Knowledge Bank must NOT deduct Marks (verify no deduction entry created)

**Acceptance:**

- Student with ≥35 Marks → can open Knowledge Bank, no deduction
- Student with <35 Marks → blocked, prompted to top up
- Copy is parent-legible (prd.tex:315)

---

### F16: Achievements Public Landing Surfacing

**PRD:** FR-18

**Current state:** **PARTIAL (2026-08-14).** Static 3-card section on the landing page with hardcoded "public API not added yet" note. Backend has **no** public achievement procedure — a new public `achievement.listApproved` (or similar) route is required before real data can be shown.

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

**Current state:** **PARTIAL (2026-08-14).** The booking detail route is implemented for student and tutor views, including a state timeline, meeting/room sections, cancellation, tutor accept/decline, and tutor session completion. Missing: reschedule (F6/F7), lateness/no-show reporting (F3), and session notes (F9) — all backend-dependent gaps.

**Required:**

1. New route `/_app/bookings/$bookingId` — booking detail
2. Shows: booking state, type, tutor, participants, scheduled time, meeting link (if created), room (if offline), price, hold amount, state history timeline
3. Student actions: cancel (pre-H-2), report lateness (F3), accept/reject reschedule (F7)
4. Tutor actions: accept/decline (existing in tutor-bookings), propose reschedule (F6), complete session (F8), add session notes (F9)
5. Meeting link visible only after all confirmations (G11 backend)
6. State history: timeline of all transitions with timestamps and actors

**Acceptance:**

- Clicking a booking in list → opens detail
- All role-appropriate actions visible
- Meeting link gated by confirmation state
- State history visible

---

### F18: Group Invite Accept/Decline/Reconfirm UI

**PRD:** FR-20, TC-25

**Current state:** **PARTIAL (2026-08-16).** Open PR #55 wires `confirmInvite`/`declineInvite`/`reconfirm` in `booking-lifecycle-actions.tsx`. **Still missing:** inviter-side `withdraw` UI for an invite, and the full no-opt-out disclaimer on the invitee acceptance screen (see F14).

**Required:**

1. Invitee view showing: all session dates/times, per-student price, total Marks hold, full-series no-opt-out disclaimer (per TC-25 / F14), accept/decline actions
2. Accept → calls `booking.confirmInvite`
3. Decline → calls `booking.declineInvite`
4. Reconfirm flow for invitees whose attendance confirmation expires → calls `booking.reconfirm`
5. Inviter-side withdraw for an invite → calls `booking.withdrawGroup`
6. Post-action states rendered (confirmed/pending/declined/withdrawn) in both the group booking detail and the invitee's booking list

**Acceptance:**

- Invitee can accept/decline a group invite and sees schedule + price + hold + disclaimer first
- Reconfirmation prompt appears when needed
- Inviter can withdraw an invite
- No `confirmInvite`/`declineInvite`/`reconfirm`/`withdraw` gaps remain in `apps/web`

---

### J2: Session Expiry UX

**PRD:** J2 (foundation-hardening), session expiry (7 days)

**Current state:** **LAZY HANDLING ONLY (2026-08-14).** No proactive expiry UX. `_app.tsx` `beforeLoad` calls `getSession()` and redirects when the session is gone; `orpc.ts` `QueryCache` redirects on 401/403. There is no countdown, toast, or pre-expiry warning.

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

**Current state (2026-08-14):** Three components have **0 importers** in `apps/web` and are candidates for removal:

- `chart.tsx`
- `data.ts`
- `user-menu.tsx`

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

Card, Button, Badge, Heading, Text, Stack, Input, Field, Select, Menu, Table, Item, Avatar, Divider, Separator, Checkbox, Chip, IconBox, InputGroup, Kbd, Sidebar, Toast. See AGENTS.md for full list + import paths.

---

### Version Notes

- v1.3 (2026-08-16): Wave-3 P2 executed — full blocker report posted on PR #55 ([comment 5306378534](https://github.com/cogitoacademy/app/pull/55#issuecomment-5306378534)) covering the red CI (TS6133 `proposedEndAt` at `booking.service.ts:1407`), migration 0020 achievement-column schema mismatch, undeclared F18/J2/dead-components section deletions, stray `.qa-marks-before/` + `artifacts/` at repo root, and the backend surface riding the PR (multiparty reschedule, `studentProcedure`, admin-tutor edit review, migrations 0019/0020/0021). Blockers remain with the branch author; PR #55 is not mergeable until resolved.
- v1.2 (2026-08-16): Re-audited against open PR #55 (`f/frontend-prd-gaps`, 25 commits). Marked F2/F3/F6/F7/F11/F17 as covered by the PR (Closed* = pending merge), F1/F9/F12 as partial-after-PR, and corrected F13's backend note (`tutor.getMyPayouts` exists since #43). Flagged the PR's blockers (red CI unused `proposedEndAt`; migration 0020 achievement-column schema mismatch; undeclared F18/J2/dead-components section deletions) — tracked in REVIEW-FIXES-3 P2. Still open after PR #55: F8, F13, F14, F16, F18-withdraw, J2, dead-components cleanup.
- v1.1 (2026-08-14): Full frontend audit at `apps/web` git HEAD `9b7df5e`. Corrected the "Current Frontend State" routes table (was stale — e.g. notifications page existed). Statuses updated: F4, F5, F10, F15 → **Closed**; F8, F16, F17 → **Partial**; F1-F3, F6, F7, F9, F11-F14 → **Missing**. Added gaps F18 (group invite accept/decline/reconfirm UI), J2 (session expiry UX), and a dead-components cleanup note. Effort revised from ~20d to ~15d for the remaining ~10 gaps.
- v1.0 (2026-07-29): Created. 17 frontend gaps catalogued (F1-F17) with PRD references, backend dependencies, and acceptance criteria. Derived from PRD §Product Surfaces and audit of `apps/web/src/`. Runs parallel with backend PRD-GAPS-SPEC.md.
