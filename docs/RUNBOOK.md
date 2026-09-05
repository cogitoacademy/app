# Cogito Runbook

Last updated: 2026-09-04

On the student dashboard, verify the balance widget shows available, held, and
total Marks from the wallet snapshot. **Top up** must open `/balance`. At 35 or
more total Marks, the Balance page's Knowledge Bank card must show access and
open `/knowledge-bank`; below the threshold it must offer a top-up path. Confirm
the Balance page places the widget beside Knowledge Bank Access on desktop and
stacks them cleanly on narrow screens. On the student dashboard, confirm the
widget's **Find a tutor** action opens `/tutors`; its dashboard counterpart keeps
**Top up** and opens `/balance`. Confirm the widget remains contained beside the
Competition Calendar card on the student dashboard. At 320 px and 390 px wide,
confirm the Balance page has no page-level horizontal clipping before and after
creating a QRIS purchase; the QR code must scale within its nested payment card.
Test with populated Marks history as well: mobile amounts should sit below their
descriptions, while desktop amounts remain right-aligned on the same row. Each
date must appear below its transaction reason, and both the amount and resulting
balance must use the shared Marks icon as a prefix.

The admin dashboard Booking activity card now opens its explanatory copy from a
compact info icon directly beside the title. Verify the popover opens with
hover, keyboard focus, click, and touch; remains readable in light and dark
themes; and does not displace the WIB badge. No environment or operational
change is required.

Repeat the interaction check on booking-detail cards with explanatory header
copy: Session overview, Series sessions, Activity, Honorarium/Marks, Booking
actions, Session notes, Support reports, Stay in touch, Room assignment, Admin
review context, Wallet impact, and State history. The trigger must sit directly
beside its title without leaving a blank description row.

The 2026-09-04 sidebar logo contrast polish is frontend-only. It adds no
environment variables, migrations, jobs, or operational steps.

On the authenticated student, tutor, and admin shells, create or seed pending
booking rows and verify the sidebar shows a compact badge beside **My Bookings**
or **Bookings**. The number must match the pending rows in the shared **Needs
action** view, disappear when there are none, and render `99+` when the result
exceeds the compact display limit. Confirm the link remains keyboard accessible
and the badge does not widen or overflow the sidebar.

Also verify the primary sidebar order: students see **Dashboard**, **Tutors**,
**My Bookings**, **Balance**, **Achievements**; tutors see **Dashboard**,
**Bookings**, **Availability**, **Tutor Profile**; and admins see **Dashboard**,
**Operations**, **Bookings**, **Tutors**, **Economy**, **Achievements**. The
shared Resources group and footer account menu should remain available, and the
**Tutor Profile** wording should remain unchanged. This is presentation-only;
no environment or operational change is required.

## Production UI and E2E audit (2026-09-04; reschedule follow-up 2026-09-05)

The full browser workflow now contains **14 tests across four specs**. The
booking spec passes 7/7 locally, covering the seeded student solo and group
booking flows, tutor acceptance/decline, accepted-online reschedule, and
cancellation. The other specs cover cross-student access denial, contact
privacy, all-role economy checks, and booking layout containment at 170px and
390px. The layout check is safe to run after state-changing tests because it
accepts either booking rows or the empty-state collection view.

The root `bun run check-types` gate also type-checks `packages/e2e` with the
browser DOM library enabled, so layout assertions cannot drift outside the
repository's normal typecheck coverage. CI retains both the HTML report and
failure screenshots/traces for diagnosis.
The migration step explicitly passes `ENV_FILE=../../apps/server/.env.test`
through the Turbo `db:migrate` task, keeping the browser database isolated.
Chromium installation runs with `packages/e2e` as its working directory so the
CLI resolves the locked `@playwright/test` version and installs the exact
headless-shell revision expected by the browser suite. If CI reports a missing
Playwright executable, verify this working directory before changing test code.

The authenticated shell has a skip link, accessible sidebar state, semantic
tutor-card buttons, explicit page headings, and production-only devtools
guards. Time-sensitive labels refresh through a shared 30-second clock hook;
reduced-motion and token-based overlay styles remain in effect.

The 2026-09-02 admin booking-detail layout consolidation adds no environment
variables, migrations, jobs, or operational steps.
The 2026-09-03 override-participant selector update also adds no environment
variables, migrations, jobs, or API contract changes. In the override dialog,
choose affected people from the booking roster by name/role; do not type user
IDs manually.
For an offline scheduled booking, remove its room and verify the room selector
remains available; assigning a new room must succeed without changing the
scheduled session window.

> **Quick entry:** for "I want to change X → which commands do I run", use
> [INFRA-PLAYBOOK.md](./INFRA-PLAYBOOK.md) (scenario → command decision
> table, incl. deploy/migration/disaster-recovery flows). This document
> holds the detailed procedures behind it.

## Collection transition QA (2026-08-28)

The stable-pagination behavior requires no environment variable, migration, or
server rollout. When checking the web UI, verify that changing either admin
tutor table page keeps the old rows visible while loading, disables that table's
pagination controls during the request, and scrolls the owning card into view.
Changing tutor discovery search/filters and the admin booking-queue filters
should also retain the prior collection until the response arrives. Wallet
lookup and student search should continue to replace results only after their
own query completes; wallet lookup should search by visible user identity and
only load wallet data after an admin selects a result.

Started-session cancellation check: open a scheduled booking as its student before start and confirm Cancel booking is available. The confirmation dialog must require a non-blank reason, keep its submit action disabled for whitespace-only input, and share the saved reason in booking activity/notification. Tutor decline and both student/tutor reschedule APIs must also reject a missing or blank reason. At/after `scheduledStartAt`, reload the detail and confirm the action is absent. Calling `/rpc/booking/cancel`, participant withdrawal, or per-series-session cancellation directly must return `BOOKING_CANCELLATION_DEADLINE_PASSED`, must not deduct/release Marks or cancel the meeting, and the tutor must still be able to complete the booking. Route post-start delivery/attendance problems through support/admin review.

Booking-list smoke check: verify Needs action, Upcoming, Recurring, History, and All. Students and tutors default to Needs action when pending decisions exist and Upcoming otherwise; admins default to All. Recommended places pending decisions above active bookings and terminal outcomes at the bottom. Soonest and Latest order by scheduled date, `?tab=`/`?sort=` preserve choices, and History contains every terminal outcome. With more than 20 bookings, verify **Load more bookings** appends the next cursor without removing the current cards, keeps the page stable while loading, and removes itself after the final page. Tab counts should show `+` until all pages are loaded.

Timing-chip check: pending rows with `deadlineAt` show Respond in, switch to warning within three hours and danger within 30 minutes, then say Response overdue without pretending the state is Expired. Confirmed/scheduled rows show Today, Starts in within three hours, Starting soon within 30 minutes, and In progress between start and end. Completed, declined, cancelled, expired, and other terminal rows show no chip. Leave the page open and confirm labels refresh without reloading.
On `/bookings`, verify the timing chip follows the role-appropriate financial summary (IDR Honorarium for tutors; Earns/Total or You pay for student/admin views) and has a vertical divider on its left. On student and tutor dashboards, verify the shared next-lesson card hides You pay/Earns/Total while retaining the timing chip.

On the student `/tutors` page, open **Filters** at a 320 px CSS viewport and
verify the filter card and category/specialization popups stay inside the
viewport. Select multiple categories and confirm the selected indicators and
the popup's right edge remain visible; the page itself must not gain horizontal
overflow. Repeat at 390 px.

For manual tutor-invite delivery, copy the visible latest link. After reloading the page, use **Generate & copy link** on a pending invitation history entry; this safely rotates the token instead of persisting plaintext secrets.

**Generate & copy link** never sends email. Use the separate **Send again** action when an admin intentionally wants Resend to deliver a replacement link.

Tutor invitation delivery should be smoke-tested in both desktop and mobile email clients. Verify the **Accept invitation & set up profile** button and fallback URL lead to `/invite?token=…`, the invited account email is correct, and the displayed expiry is explicitly labeled UTC.

On `/admin-tutors`, verify the Invitations table uses semantic status colors: invited is warning, accepted is success, and expired/revoked are danger. The invitation filter and row actions should remain unchanged.

Also verify the Invitations table shows up to 3 rows per page and Tutor Profiles shows up to 5 rows per page; each table's pagination advances independently.

## Starting the Server

### Production URL topology

- Company profile: `https://cogitoacademy.id` (kept on Hostinger)
- API/Auth/health/webhooks: `https://api.cogitoacademy.id`
- Frontend: `https://app.cogitoacademy.id`

Do not point the apex DNS record at the OVH VPS. Configure only the `api` and
`app` subdomains to the VPS; keep Coolify administration private through an
SSH tunnel rather than exposing port `8000`.

**Coolify API access (verified 2026-08-31):** the Coolify container publishes
`:8000` on `127.0.0.1` only (`127.0.0.1:8000->8080/tcp`), so the control node
must tunnel before running `coolify-resources.yml` / `drift-check.yml`:

```bash
ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@100.124.43.19
```

The playbooks default to `http://localhost:8000/api/v1` (the tunnel). The
Coolify host server is registered as `localhost` (`ip=host.docker.internal`),
matched via `is_coolify_host` — not by IP.

For Terraform bootstrap, first-time provisioning, normal releases, and the
manual GHCR/Coolify fallback when CI quota is unavailable, see
[Setup and Deployment](./DEPLOYMENT.md).

The Coolify `localhost` server validates itself by SSH-ing to
`host.docker.internal` with Coolify's generated key. Root password login stays
disabled; only that key-based connection is allowed. The bootstrap exempts
Docker's private `10.0.0.0/8` range from fail2ban, which prevents repeated
Coolify checks from causing a false `Connection refused` status.

### Login/auth smoke check

Open `/login` in a clean browser and sign in as a student, an onboarding-incomplete tutor, an already-submitted tutor, and an admin. The email button may show progress while the auth request, fresh session read, and tutor-status read complete; it must then go directly to `/dashboard` for the student, submitted tutor, and admin, or `/profile` for a tutor with no profile or `draft`/`changes_requested` status, without an intermediate `/login` navigation. Verify a wrong password returns the form with an error and the button is usable again. For a return link such as `/login?redirect=/bookings`, verify it lands on the validated target after the same handoff.

Also verify the client validation feedback: blur an empty or malformed email, a short password, and (on sign-up) a short name or password missing uppercase/lowercase/digit requirements. Each invalid field should show its own Selia inline error and danger outline; submitting incomplete data should reveal the field errors and must not call `/api/auth`. Correcting the values should clear the errors and re-enable the normal auth request. An API-level malformed JSON request to `/api/auth/sign-up/email` must return 400, never 500.

### Profile and tutor-onboarding smoke check

After a web deployment, sign in as a student and open `/profile`; then sign in
as a tutor and open `/profile` to inspect the tutor-owned editor. A new or
incomplete tutor should arrive there after login, while a tutor whose profile
has already been submitted should arrive at `/dashboard` and can open
**Tutor Profile** from the sidebar when needed.
Submit incomplete forms and confirm validation messages remain inline, the page
does not fall into the generic error screen, and the browser console has no
`Base UI error #28`. A `500` shown by the client error page together with
`FieldRootContext is missing` means a `FieldLabel`, `FieldDescription`, or
`FieldError` has been rendered outside a Selia `Field` root; inspect the affected
form composition before checking the API or database.

For a complete draft or `changes_requested` tutor, click **Submit for review**
and confirm the bilingual Indonesian/English Terms of Service dialog opens. The
primary action must remain disabled until the agreement checkbox is selected;
both language sections must be readable in Indonesian-then-English order, and Cancel/Exit must leave the
profile unsubmitted. Accept the terms and verify the profile moves to
`pending_review`. Reload the tutor profile and submit again after a revision;
the dialog should not appear a second time, and the acceptance timestamp/version
should remain unchanged. The sticky action area must still show
**View Tutor Terms**; opening it shows the current document
without the acceptance checkbox or a submit action.

For Google sign-in, start from `https://app.cogitoacademy.id/login` in an incognito/clean browser and confirm the provider callback is `https://api.cogitoacademy.id/api/auth/callback/google`, followed by the frontend route `/auth/callback` and the role-appropriate destination. The Google authorization URL must contain `prompt=consent`; record the Google permission screen in the verification video and click **Show all services** so every requested identity scope is fully expanded and readable before accepting. In DevTools, the initial auth response must set `better-auth.state` with `Secure`, `HttpOnly`, and `SameSite=Lax`; the callback request must include that cookie and its `state` query parameter. Keep the Google Cloud OAuth client configured with the frontend origin `https://app.cogitoacademy.id` and the API redirect URI `https://api.cogitoacademy.id/api/auth/callback/google`. This login flow requests identity scopes only. For the separate Calendar scope used by automatic Meet creation, use the dedicated Meet OAuth client and the consent/refresh-token procedure in `docs/GOOGLE-MEET-SETUP.md`; do not add Calendar access to every user's login.

### Dashboard smoke check

After a web deployment, sign in once as each supported role and open `/dashboard`. Verify the sidebar user menu shows the authenticated profile image when one is configured and uses initials when it is not:

- Student: learning welcome, next lesson, Knowledge Bank/calendar, and tutor recommendations. Confirm the welcome card shows the SVG illustration and shared spacing/sizing used by the tutor dashboard. If a booking exists, confirm the next-lesson card matches the booking-list date tile, participant metadata, Marks display, status tooltip, and detail action.
- Tutor: the first dashboard row shows the same SVG welcome card visual plus teaching setup, and the next visible row shows requests to review plus next lesson before metrics/payout; actions link to `/bookings`, `/availability`, and `/profile`. Verify the review card keeps its empty/loading slot when there are no requests, and that the Payout details info icons open their respective unpaid-honorarium and transfer-fee explanations and remain keyboard accessible. When a tutor submits the initial profile form, confirm the app redirects to `/dashboard` and the browser Back button does not return to the form. A later login for that tutor must also land on `/dashboard`; a `draft` or `changes_requested` tutor must land on `/profile` so the profile can be completed or corrected. Opening the legacy `/onboarding` URL should land on `/profile`.
- Admin: a normal login must land on `/dashboard`; open the admin workspace and verify the compact escalated-operation, tutor-review, and achievement-review counts above Business insights. Use the sidebar to open `/admin-operations`, `/admin-tutors`, `/admin-achievements`, and `/admin-economy`. In `/admin-operations`, verify category, urgency, and SLA-status filters; open a queue item and confirm its reported reason/source, affected-user count, OQ-04 deadline, time-since-report, escalated badge, and WhatsApp escalation action. Clicking the escalation action must show the confirmation modal; Cancel keeps the admin page in place, while Continue opens the Cogito support conversation at `+62 881-0119-90195` in a new tab. In the Wallet lookup tab, search a partial name and an email, select the intended user from the bounded identity results, and confirm the selected name/email/role, total/held/available Marks, and latest ledger entries load; verify a changed search does not leave the previous user's wallet visible. Confirm the hydrated participant wallet/booking-ledger cards and state-history timeline load, then use **Open override** to reach the existing preview/apply flow. In the override dialog, confirm the booking roster appears as a name/avatar/role multi-select, selected participants are summarized without requiring manual IDs, and Preview/Apply still succeed. In `/admin-economy`, verify the active schedule loads, edits persist after reload, and the preview updates.
- In the admin dashboard's **Business insights** section, verify the default 30-day view loads KPI cards, booking activity, current booking portfolio, audience growth, session-format mix, and top categories. Switch to 7 and 90 days and confirm the charts reload with continuous WIB date labels; verify zero-data periods show an intentional empty state, the retry state is actionable, and the dashboard remains usable while analytics loads. Confirm the note distinguishes Marks-based platform take from cash revenue; the dashboard intentionally keeps only the compact queue counts above analytics, while actionable queues remain on their dedicated admin routes.
- In the Operations → Room approvals tab, verify the Active rooms catalog loads. Use **Add room**, enter a name, location, and positive whole-number capacity, submit, and confirm the new room appears in the list and in the Offline room selector. Confirm blank names/locations and invalid capacity stay in the dialog without an RPC request. Then verify the pending offline room-approval queue loads. Use **Assign** for a requested room. Use **Choose another** (or **Choose room** when the original request conflicted) to open the admin booking detail; confirm the Offline room card shows the booking schedule without a UUID/date-time form, lets the admin select a target room, and calls **Assign room** or **Relocate room**. Confirm **Cancel** opens a confirmation dialog explaining the booking/hold impact, then refreshes the queue after confirmation.
- In `/admin-tutors`, open a profile with pending edits and confirm the proposed specialization changes show readable category/specialization labels instead of raw UUIDs. Resize to a narrow viewport and verify specialization badges and other long pending values wrap without horizontal page overflow; use **Edit format** to correct structured education/competition entries, save, reload, and confirm the version-checked update and success toast. The review request/response payloads must remain unchanged.

### Theme shortcut smoke check

From any authenticated shell page, press `D` once and verify the UI switches between the rendered light and dark themes; press it again to switch back. In dark mode, confirm the complete Cogito Academy sidebar logo, including the wordmark and academy label, renders white rather than orange/purple; in light mode, confirm the original logo colors remain. Confirm the theme menu still supports Light, Dark, and System, and that the explicit selection survives a page reload. While focused in an input, textarea, or editable field, press `D` and confirm the field receives the character without changing the theme. Modifier-key combinations and holding the key should not cause extra toggles.

### Competition Calendar smoke check

As an authenticated user, open `/calendar` and confirm published Sanity competitions render in the month grid. Verify today, outside-month days, multi-day spans, and the `+N more` overflow popup; select an event from either the grid or popup and confirm the responsive details modal shows categories, level, scale, organizer, location, timeline, registration deadline, description, and the available external-link actions. Navigate to a month with no events and confirm the normal weekday headings, date cells, outside-month cells, and month navigation remain visible instead of an empty-state replacement. On a short viewport, verify the page heading and calendar toolbar remain in place while only the calendar body scrolls vertically; on a narrow viewport, verify only the month grid scrolls horizontally. Switch to **Agenda**, confirm the 30-day grouped list and rich event cards, use `M`/`A` to switch views, and verify previous/next period plus **Today** navigation. The calendar remains read-only and the browser console should remain free of runtime errors.

The route selects the dashboard from the authenticated session role. A tutor or admin must never receive student-only wallet or booking queries from this page.

### Knowledge Bank smoke check

As an authenticated student, open `/knowledge-bank`. With at least 35 total Marks, confirm published Sanity resource metadata loads, category slugs render as human-readable labels in the filter dropdown, search/category filtering works, and the PDF preview opens through the authenticated `/content/knowledge-bank/:resourceId/file` proxy. Below 35 Marks, confirm the page stays locked and offers the balance/top-up action. Then sign in as a tutor and an admin with no Marks balance and confirm each role sees Knowledge Bank in the sidebar, the route loads resources, and the PDF preview opens without a wallet threshold. Opening the Knowledge Bank as an eligible student, tutor, or admin must not create a Marks deduction.

### Empty-state consistency smoke check

With signed-in student, tutor, and admin sessions, exercise empty data and no-match states in the calendar, tutor discovery, Knowledge Bank, bookings, notifications, achievements, balance history, availability preview, booking detail, and admin operations surfaces. Confirm collection and event-free agenda states have the shared Selia icon/title/description treatment where applicable, while an event-free month keeps its normal calendar grid instead of an empty-state replacement. Confirm each state uses the right density for its context, distinguishes an empty collection from an active filter with no matches, and keeps its action usable when one exists. Check the notification menu, calendar popup, dialog sections, field-level specialization/proof-link states, and table/list sections for blank areas or orphaned headers. Repeat in light and dark themes and at narrow width; there should be no page-level horizontal overflow or duplicate empty copy, while intentional table containers may scroll horizontally when their minimum column widths exceed the viewport. This is frontend-only and must not change request payloads.

For admin operations, confirm the booking monitor keeps body text readable, aligns multi-line cells at the top, and keeps status/category badges on one line. At a narrow mobile viewport, verify the Operations page and monitor card do not exceed the viewport width; horizontal scrolling must be confined to the table contents. Open **View details** and verify navigation to `/admin-operations/bookings/:bookingId`; refresh that URL and confirm participant wallets, booking ledger activity, meeting fallback, report context, state history, and override controls still load. A student or tutor opening the URL must be redirected to `/dashboard`, and a missing booking must render the in-page not-found state with a route back to operations.

For local verification, run `bun .github/lint/check-baseline.ts` and
`bun run check-types` from the repository root. Lefthook runs those same two
checks before push. Use `bun run lint` when inspecting the complete raw lint
output, including documented legacy errors. The type check runs the web
production build before TypeScript checking, so a missing empty-state import
or invalid Selia variant is caught before review.

### How Cogito Works guide smoke check

Open `/guide` after signing in as each supported role. Verify the guide loads without API requests beyond the existing authenticated shell, presents the correct journey by default, and exposes the following views:

- Student: Student only.
- Tutor: Tutor and Student.
- Admin: Admin, Tutor, and Student.

Select each available role view from the standalone control at the top and confirm the URL updates with `?view=...`, all step details are open on first load, and a disallowed view falls back to the role's default. On desktop, verify the guide is centered within a `max-w-6xl` shell and the right-side chapter rail remains sticky; its single progress index, numbered Selia `Item` rows with a badge-like semantic `ItemMedia` tint, step counts, and selected chapter should update as you scroll and click. On narrow screens, verify the rail stacks above the content without horizontal scrolling. Use the global Collapse/Expand details control and individual timeline buttons with both pointer and keyboard input; verify the height and content transitions are smooth, reduced-motion preferences remove the motion, and statuses, What if? branches, and CTAs remain readable. Confirm the important timing callouts render as bold text and state the concrete rules: invite links expire after 7 days; booking response, participant confirmation, reconfirmation, and room approval allow 12 hours unless the session starts sooner; student self-service changes close at H-2 (2 hours before start); reschedule proposals expire after 24 hours; lateness/no-show reporting starts after 15 minutes; meeting retries run every 5 minutes for up to 3 attempts; and support exceptions use a 30-minute business-hours or 4-hour outside-hours SLA. Check that CTAs open the existing tutor, booking, profile, operations, achievement, economy, calendar, balance, and resource surfaces.

Guide copy is maintained in `apps/web/src/components/guide/guide-content.ts`. When a booking state, role responsibility, or linked route changes, update the corresponding typed step/branch and the guide content test in the same change. The guide is intentionally code-managed in v1; no admin editor, CMS publish step, or API migration is required. During local visual refinement, toggle the development-only Tweaks Bar with `Ctrl/Cmd+Shift+.`; treat its values as exploration until the chosen change is copied deliberately into the guide styles.

The shared route pending state uses the token-based loading ring from `apps/web/src/components/loader.tsx` and the local Selia `Spinner` from `packages/ui/components/selia/spinner.tsx`. If a navigation smoke test catches a loading state, verify the ring track, primary progress arc, and `Loading` label remain visible in both light and dark themes, and that the ring remains understandable without animation under reduced-motion preferences.

### Not-found and connection-error smoke check

Open a clearly invalid client route such as `/this-page-does-not-exist`. Verify the branded 404 state appears with the large outlined `404` visual, human-readable copy, and a single tertiary **Go back** action; confirm the page does not show the generic `Not Found` fallback. Trigger a route/render failure in a controlled test environment and verify the matching `500` state offers the same single **Go back** action without exposing the raw exception. During a controlled API outage or offline browser state, verify query/auth surfaces say that Cogito could not connect and suggest checking the internet connection and trying again—never expose raw `Failed to fetch` or similar browser exception text.

### Notification inbox smoke check

As a signed-in student or tutor, open `/notifications` and confirm the list shows the notification title/body, a human-readable category badge, an exact date/time, relative age, unread emphasis, and a booking link when the notification has a booking. Open the shell bell and click a notification; verify an unread item is marked read and navigation continues to its associated booking, balance, achievements, calendar, or notifications page instead of stopping at the read-state update. Select one row and verify **Mark as read** and **Mark as unread** both update the row and the shell bell count. Select multiple rows, use **Select all**, and verify both bulk actions update only the selected rows. Loading older notifications must keep the current selection model usable; changing read status must clear the selection after success. As another user, confirm a selected ID cannot change a notification owned by someone else.

### Economy rate-control smoke check

As an admin, open `/admin-economy`, confirm the Marks value, tutor minimum/increments,
and online/offline Cogito take schedule are visible. Change a Cogito base or increment
by a valid Rp 5,000 step, save, reload, and verify the version increments and the
preview for class sizes 1–6 changes. The save is optimistic-lock protected and affects
only future booking/repricing snapshots; existing booking snapshots must remain unchanged.
After a successful change, verify no `Cogito rate updated` in-app notification appears
for tutors. Re-saving the same values should not increment the version, add an audit
row, or create another notification.
As a student or tutor, opening `/admin-economy` must redirect away and direct
`admin.getEconomySettings`/update calls must return FORBIDDEN.

The tutor profile at `/profile` should show IDR base honorarium fields (online/offline), enforce the
Rp 50,000 minimum and Rp 5,000 steps, show one combined six-row preview matrix for the
selected modalities, and must not describe Marks as cash-out. Student
tutor discovery and booking previews should show computed Marks per student for the
selected modality; legacy profiles without `baseRatesIdr` remain readable. Change a
published tutor's base honorarium, confirm it is available for a new booking, and
verify a booking created before the change still pays out using its original
`priceSnapshot` honorarium.

The tutor payout form must collect bank name, account number, account-holder name,
account-opening city/regency, account ownership (the tutor's own account or a
trusted person's account), and an acknowledgment that Cogito is not responsible
for issues after transfer to the provided account. Verify the copy identifies only
conventional BCA as fee-free; BCA Syariah and blu (BCA Digital) must be treated as
non-BCA and charged Rp2,500 per payout.

Tutor portrait operations use a staged source-to-final workflow. The tutor uploads one
source image through `upload.createUploadUrl`; draft/source profiles store it through
`user.image`, while a published tutor's replacement is staged in
`pendingProfileChanges.profileImageUrl`. In the admin review drawer, upload the edited
background-standardized asset (a hosted URL remains available as a fallback), then use
an approve/publish action to promote it to `user.image`. Requesting changes must leave
the current public photo untouched. On the tutor surface, verify the compact photo info
preview opens on demand instead of keeping a large preview card in the form. Verify the
photo/review history timeline in both
tutor and admin surfaces after submit, revision, approval, and publication. The
tutor timeline should show actor names/types without exposing actor account emails;
the admin timeline may retain the richer moderator identity context.

Tutor-profile achievement and experience proof URLs are verification-only
tutor-profile data. All user/admin-supplied external links in tutor
proof/profile-image fields and manual meeting-link dialogs must use
`http://` or `https://`; generated local profile assets may use the bounded
`/uploads/...` storage path. Schemes such as `javascript:`, `data:`, and `file:`
must be rejected by the API even if client validation is bypassed.
Operators may open them from the admin tutor review card, but they must not be added
to public discovery projections, marketing exports, or student-facing interfaces.

Student achievement proof links are a separate workflow: the student owns the
submitted link and the achievement admin queue uses it for verification, while
the public projection omits it. The student form should explain how to upload
proof to Google Drive and set General access to “Anyone with the link” + Viewer.

### Shared booking list smoke check

Verify booking titles use `Cogito - {Competition} | {Tutor} x {Student}` and
group/group-series titles use `& Friends`, matching the Google Calendar/Meet
summary rather than listing participants with `+N`.

With seeded student, tutor, and admin sessions, open `/bookings` and verify the same list layout loads for each role. Students see proposer/participant bookings, tutors see assigned bookings with the Cogito mark icon before `Earns: X` and `Total: Y`, and admins see the full list with the icon before `Total X` and `Tutor Y`, with no lifecycle mutations. Verify the Upcoming/Pending/Recurring/Past/Cancelled/All tabs, that generic status badges are hidden outside All (except attention states), and that hovering/focusing a visible status badge shows its explanation. On a narrow viewport, confirm the rounded tab strip fills the available page width, only the inner tab list can be swiped horizontally to reach every tab, active-tab shadows and focus rings remain visible at both scroll edges, and the page does not create horizontal overflow or show a scrollbar. Confirm the empty-state outline and decorative glow remain visible inside the rounded card boundary without creating overflow. Confirm mobile rows keep date, location, and tutor name readable beside the booking summary, while desktop time/location/tutor metadata stays aligned and the action button remains at the far edge. For single-session group bookings, student `You pay` must show the per-student amount, and the participant avatar stack must not include the tutor. Open a row’s detail page to perform actions; list rows should not expose inline cancellation or reschedule mutations. `/tutor-bookings` should redirect to `/bookings`.

Verify the role-aware default tab: students and tutors open on Needs action when pending decisions exist and Upcoming otherwise; admins open on All. Explicit `?tab=` and `?sort=` selections must override the defaults. Recommended sorting must put pending decisions above active bookings and terminal outcomes at the bottom, using soonest dates within active groups and latest dates in History. Verify that Soonest and Latest order solely by scheduled date.

### Booking detail smoke check

Open an online booking detail as each role and verify the shared overview shows date/time first, then `Format & access` with the meeting CTA or pending/retry status, followed by participant rows with saved profile images (or initials), names, roles, and confirmation states. On desktop participants may use two columns; on narrow screens they stack without hiding names. When available, `Booking actions` appears above the role-appropriate financial or operational card in the sticky desktop rail and before Activity on narrow screens; session notes/support reports remain in the main flow. Tutors must see the IDR Honorarium card only; students see the Cogito Marks card; admins see the wallet-impact card and admin review context, plus their admin-only room, wallet/ledger, state-history, and override controls. Every student Marks amount has the Cogito mark prefix. The Activity card should read newest-first as a vertical timeline with a transition-specific icon, one destination-state badge, actor type, timestamp in the booking timezone, and any transition reason; the previous state is shown as muted context when available. After a tutor accepts an online booking, the link is generated immediately; a successful provider call moves the booking to `scheduled`. In Google Calendar, verify solo uses `Cogito - MUN | [Tutor] x [Student]` (or the selected competition label) and group/group-series appends `& Friends`. The description must list Tutor, Student, `Session Topic: [category] - [specialization]`, Session Notes with pasted links preserved, and a clickable `/bookings/{bookingId}` link. Accept an online reschedule and verify the same event moves to the new slot on both organizer and attendee calendars, and its Meet conference remains available. If provider creation fails, the booking remains `confirmed`, the detail overview says it is retrying, and the `retry-failed-meetings` scheduler retries every 5 minutes. If no link is available, the assigned tutor can use **Add meeting link** and an admin can use **Add/Replace link** in operations; verify the shared Selia dialog accepts a trusted `http`/`https` URL and that the student read becomes ready without a reload. Repeat after multiple failed provider rows to confirm the newest meeting-attempt row is updated. For an offline booking, assign a room and verify it becomes `scheduled` even if Calendar is unavailable. With Calendar configured, verify exactly one event is created with the same title/description/attendees, the assigned room name and location, and no conference data or Meet URL. Relocate and reschedule it and verify location/time update in place; cancel or expire the booking and verify the event is deleted. Repeat the assignment sync and confirm no duplicate event appears.

The overview row must show one `Date & time` field with the date and session hours merged beside `Format & access` in a two-column desktop grid; on narrow screens the two fields stack without horizontal overflow. The online `Format & access` section now shows only the compact info trigger; activate it with mouse, keyboard, and touch to verify the Selia popover exposes the pending/failed explanation plus retry or manual setup status, or the `Open meeting room` action when a URL is available. Available links must not render a `Ready` badge or standalone meeting CTA. Offline bookings without an assigned room should expose the same trigger beside `Offline`; tutors with an eligible `Complete session` action should find its completion-timing explanation beside the button. Confirm the Participants heading uses the matching Selia `IconBox`, and on desktop all eligible booking actions, including propose and complete, sit at the bottom of the right header column beneath the state badge. Also confirm Activity follows the left-column content with only the normal section gap even when the Actions/Marks rail is taller; on narrow layouts the order remains overview → actions/financial content → Activity.

### Meeting fallback and exception smoke check

Force the Google provider into an unavailable state or use the fallback test provider. After tutor acceptance, verify an online booking stays `confirmed` while retries remain, then use the tutor's **Add meeting link** action. The tutor action must succeed only for that tutor's own online `confirmed`/`scheduled` booking; offline, terminal, pre-confirmation, and another tutor's booking must be rejected. A student must not be able to call the tutor action. In `/admin`, verify an admin can add or replace the link for an eligible online booking, while offline bookings are rejected. The API-level regression command is:

```bash
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/admin-meeting-link.test.ts
```

For a force-majeure or other exceptional case, use the admin override flow with an auditable reason and the appropriate affected participants/Marks action. For `force_cancel` + `release_holds`, verify the booking becomes `cancelled`, participant holds and booking `holdAmount` become zero, a ledger entry and state-history/audit records exist, and provider meeting cleanup is best-effort. A second override on the terminal booking must be rejected. Do not use the normal student reschedule route to bypass H-2; after H-2 the case goes through support/admin handling. The force-cancel regression command is:

```bash
bun test --timeout 30000 --env-file apps/server/.env.test packages/api/src/tests/integration/admin-override.test.ts
```

### Contact-sharing privacy smoke check

Use two student accounts that were confirmed participants in the same completed
group booking. On the booking detail, verify **Stay in touch** shows only the
other student's name/photo and a **Request contact** action; no email or phone
number should appear in the page, booking response, or network response. Send a
request with a short note and confirm the recipient sees the note plus
**Share email**, **Accept privately**, and **Decline**, with no full-chat control.

Accept privately first and verify the requester sees an accepted state but no
email. Repeat with **Share email** and verify only the requester receives the
recipient's email and that it is rendered as a `mailto:` link; the recipient's
incoming response must still contain no email value. Toggle **Allow contact
requests** off in Profile and confirm new requests are blocked. Also verify an
outsider, a tutor/admin, an absent participant, and a booking that is not yet
`completed` cannot list or create contact requests. Inspect the raw
`/rpc/contact/*`, `/rpc/auth/students/search`, `/rpc/tutors/list`, and booking
responses during the check: account emails must not appear before explicit
consent, in notifications, or in audit records.

### Form-control smoke check

On availability/profile/admin forms, verify dates use the Selia date picker, times use the 24-hour minute control, multiline fields use Selia Textarea, and IDR amounts use Selia NumberField. Focus each text-entry field at a narrow viewport and confirm its rendered font is 16px or larger so the browser does not zoom the page. On `/availability`, confirm both weekly time fields stay compact and equal in width with a centered dash between them, while focusing a time field allows its suggestions to extend beyond the field when needed; confirm the modality trigger keeps its icon and label on one row. On the calendar, verify month/year dropdowns open as Selia selects and retain the selected value. No app-level raw date, time, number, select, or textarea control should appear, and the browser console should remain free of runtime errors.

### Achievement form smoke check

As a student, open `/achievements`, choose **Add Achievement**, and verify the
Level options appear in this order: **International**, **National**,
**Province/State**, **City/Regency**, **School**. Confirm the **Proof link**
copy tells the student to upload proof to Google Drive, set General access to
**Anyone with the link** + **Viewer**, and paste the link. Confirm there is no
student-facing **Public documentation image** field.

Enter one clear Location value such as `Jakarta, Indonesia`,
`Geneva, Switzerland`, or `Online`. Confirm the section is titled
**Brief Description**, uses a multiline textarea, and shows a ranked-result
example such as “Ranked 1st among 1,000 participants across 20 countries.”
Verify the Category and Level selects open above the modal and update their
triggers. Open **Awarding Date**, confirm the calendar is visible above the
modal, select a day, and verify the trigger shows the chosen date. Open the
calendar month/year dropdowns as well; each popup must remain clickable and
must not be hidden behind the dialog backdrop.

With at least one submission present, verify the student achievement list is a
compact summary with small label-and-pill count cards matching the admin queue,
followed by a semantic table with readable achievement, status, awarded date,
and **View details** columns. Open a row and confirm the drawer exposes category,
level, location, description, attachments, and moderator notes; pending rows
must keep **Edit** and **Delete** usable. At a narrow viewport, confirm the
table reaches the card edges and scrolls horizontally inside its container
without creating page-level overflow, and that the details trigger, drawer
controls, and attachment links remain keyboard accessible.

As an admin, open `/admin-achievements`, choose **Correct** on a pending
submission, change each submission field and the **Public documentation image**,
save, and confirm the row stays pending until an explicit Approve/Reject action.
Repeat with a stale version and confirm the API returns a conflict without
overwriting the newer correction; verify the `achievement_admin_updated` audit
record contains before/after content. The API-level regression command is:

With submissions in more than one status, verify the admin queue is a compact
table with student identity, achievement, awarded date, status, and **View
details** columns. Open a pending row and confirm the drawer exposes the full
metadata, evidence/documentation, and **Correct**, **Reject**, and **Approve**
actions; reviewed rows remain read-only. Change the status filter and confirm
the counts and visible rows stay aligned. At a narrow viewport, the table reaches
the card edges and may scroll horizontally within its card, but the surrounding
page must not overflow.

```bash
bun test packages/api/src/tests/unit/achievement.types.test.ts packages/api/src/tests/unit/achievement.router.test.ts packages/api/src/tests/unit/achievement.handler.test.ts packages/api/src/tests/unit/achievement.service.test.ts packages/api/src/tests/unit/achievement.repo.test.ts
```

### Public achievements smoke check

Open `https://cogitoacademy.id/id/achievements` and `https://cogitoacademy.id/en/achievements` without an authenticated session. Verify the archive shows only approved + visible records, the homepage preview links to the archive, and changing the locale updates labels without changing the record data. Open a record detail and confirm only the student's display name and public documentation link are shown; private verification evidence and internal user IDs must not appear in the rendered page or the network response.

For an API-level check, run:

```bash
curl -sS -X POST https://api.cogitoacademy.id/rpc/achievement/listApproved \
  -H 'content-type: application/json' \
  --data '{"json":{}}'
```

The response should be the standard oRPC envelope with a JSON array. Inspect one returned record and verify it has no `userId` or `evidenceUrl`. If the API returns an empty array, the public site should render its intentional empty/error state rather than exposing draft or rejected records.

On a completed booking, verify the Session notes card is visible to both tutor and student. Select text and exercise bold, italic, heading, paragraph, bullet, numbered-list, and safe-link actions; confirm the live preview matches the persisted note after reload, the author label distinguishes your note from the other participant's note, and an attempted `<script>` or `javascript:` link is removed by the render sanitizer.

For a group booking with a pending invite, verify the invitee sees **Accept invitation** and **Decline invitation** (decline is the pre-confirmation exit path). As the booking proposer, verify **Withdraw invite** opens an in-app confirmation dialog, optionally records a reason, marks only the selected pending invitee `withdrawn_pre_h2`, leaves confirmed headcount and Marks holds unchanged, and creates a notification for that invitee. A confirmed participant uses the separate participant `withdraw` flow; group-series no-opt-out rules still apply. For a one-session group, verify the booking form shows both the per-student price and the full temporary target-headcount hold, and blocks submit when the wallet cannot cover that hold.

For booking deadline coverage, inspect a new online request, an offline request awaiting room approval, a group invite, and an `awaiting_reconfirmation` booking. Each detail page should show a timezone-aware **Respond by** notice with a live remaining window; an expired or near-expiry deadline should use the danger treatment. Confirm an invite, decline an invite, and accept/reject a reschedule from separate participant sessions. For an offline booking with a confirmed room, accept a new booking-level time and verify the room window moves with it; reject or let the proposal expire and verify the room returns to the original window. A conflicting room window must return the booking to admin room approval rather than leaving a stale room reservation. After H-2, confirm student self-service cancellation/reschedule is blocked and the late-cancellation/no-show path is surfaced with the expected warning and hold outcome. Tutor lateness reporting must be available for both online and offline scheduled bookings after the 15-minute tolerance.

### Reschedule proposal smoke check

From a booking detail in `awaiting_tutor_review`, `confirmed`, or `scheduled`, verify that **Propose new time** opens a height-constrained bottom drawer on narrow viewports and a width-constrained right-side drawer on desktop. Confirm the form body scrolls independently and the Cancel/Send proposal footer remains accessible. The start-time control must step backward/forward in 15-minute increments, show the automatically derived 90-minute end time, omit persistent “valid starts” copy, and show a danger validation message only after the chosen start leaves the selected tutor window. A non-blank reason is required before submission. Verify that a student booking proposer submits through `/rpc/booking/proposeReschedule` and a tutor submits through `/rpc/tutorActions/proposeReschedule`. Both should show the success toast and move the booking to `reschedule_proposed`; a tutor may choose a custom time outside the published availability window. A student proposal in `confirmed` or `scheduled` remains valid before H-2, while a proposal at or after H-2 must be rejected as not editable. A tutor receiving `403 Student access required` indicates the frontend is using the wrong procedure. Group bookings still in `awaiting_participant_confirmation` intentionally wait for invitees before rescheduling is enabled. For offline bookings, accept/reject/expiry must keep the confirmed room row aligned with the active schedule; a conflict should return the booking to admin room approval. Force-majeure requests after H-2 follow support/admin exception handling and require an auditable override decision rather than the normal reschedule mutation.

### Student booking responsive-layout smoke check

Open the create-booking page with a tutor that supports both modalities and several availability windows. At desktop width, confirm Session format and Booking summary form a sticky right rail and availability remains a two-column card grid. Select one slot: only that card should expand into a full row, with its own start-time editor directly beside it; there must be no consolidated “Selected session time” panel. Select additional series slots and confirm each one retains an adjacent editor. Changing modality must clear incompatible selected slots. At mobile width, confirm each editor stacks below its selected slot, Session format appears before the main booking fields, the desktop summary is absent, and a sticky bottom preview shows the current schedule and Marks price without covering the final content. Open **Review**, verify the bottom drawer shows tutor, modality, schedule, total, and available balance, then submit from the drawer and confirm exactly one booking request is created. Test insufficient balance, no selected time, blank session notes, a 2–4 session series, and a group booking; button labels and disabled/progress states must match the desktop summary.

In the same drawer, select the booking's current date and start minute. Confirm the UI explains that a different time is required and disables **Send proposal**. While a proposal is pending, reopen the drawer and select that pending start minute; it must also be disabled. Repeat against a non-first series session's own active time. Direct RPC requests for either no-op must return `BOOKING_NOT_EDITABLE` without creating or superseding a proposal. Finally, submit two concurrent proposals for one booking and verify no more than one `pending` row exists.

### Tutor specialization taxonomy smoke check

On the tutor list, search remains visible while category, specialization, and
modality start inside the closed **Filters** panel. Toggle it with pointer and
keyboard, apply filters, close it, and confirm the trigger preserves the active
selection count. The height/fade and chevron transitions should be smooth, with
no animation under reduced-motion preferences. Closed controls must not receive
keyboard focus. For multiple selections, the leading label may truncate but the
`+N more` chip must remain fully visible without a clipped border. **Clear**
resets these panel filters without clearing search.

Below the `sm` breakpoint, verify each tutor card shows a compact identity row,
a bio of at most two lines, a short specialization plus optional count, and a
separated **Starting from** footer using the Marks icon prefix and chevron. The
whole card must open the tutor drawer. The existing hover shadow remains in use
without translating the card or adding a pressed-scale effect. At `sm` and above, the existing
horizontal tutor summary remains in use.

Desktop card specialization chips should use the child specialization names
without repeating the parent category, size to their content, and truncate
within the single metadata row when necessary. Confirm the `+N` count and
`From [Marks icon] #` price block stay visible on the same line.

Open `/profile` as a tutor and verify the selector loads exactly seven active competition categories and 33 specializations from `tutors.listSubjects`. All categories should be visible with keyboard-accessible checkboxes, no manual specialization input, selected-specialization chips, and a 7-specialization limit. The selector should show the current count, disable an eighth selection, and the submit validation should reject any over-limit state. Select specializations from multiple categories, save a draft, and confirm the selections reload with the profile. A submission with no current specialization must be blocked; archived legacy specializations on an existing profile should remain visible as read-only labels. Published tutor discovery should expose current specializations and allow students to filter by category or specialization. On the tutor list page, category, specialization, and modality filter triggers must show their labels rather than raw IDs or values. Confirm category and specialization filters support multiple values, retain overlapping specializations while categories are added, remove specializations that are no longer available after a category is removed, and wait about 300 ms after typing/toggling before `listPublished` runs. Open a tutor drawer with both modalities and verify pricing appears in one table with `Group Size`, `Online (Marks)`, and `Offline (Marks)` columns; populated prices should have the Cogito Marks icon as a prefix, and a size available in only one modality should show an em dash in the other column. Below the `sm` breakpoint, confirm the student tutor profile opens from the bottom and dismisses with a downward swipe; at `sm` and wider, confirm it opens from the right and dismisses rightward. On a short viewport, confirm the profile body scrolls independently while its header and booking/close footer remain visible; body overscroll may bounce locally, but the fixed regions must not move.

### Tutor achievement and experience formatting smoke check

The tutor editor uses one combined **Achievements & experience** card and one public preview for all three structured subsections. The proof-link fields remain separate for compatibility, but the form recommends putting both achievement and experience proof in one Google Drive folder with the “Anyone with the link can view” setting.

Open `/profile` as a tutor and confirm the Public profile has no duplicate free-text Achievements or Experiences fields. In the combined Achievements & experience section, add two education entries and five competition achievements. Type a comma after one award before entering the next title and confirm the comma remains visible; verify a comma in an experience role, organization, or description also remains visible. Add up to five role/organization/year/description entries, leaving End year blank for an ongoing role. Confirm the sixth row controls are disabled, incomplete rows and an end year before the start year are rejected on **Submit for review**, and every year field displays plain digits without grouping dots. Save a draft, reload, and verify the structured arrays persist. Open a published tutor in discovery and confirm the drawer uses the published profile image as a 300px full-width hero, keeps the close control visible over the image, and layers up to three specialization badges over its lower edge. Scroll the drawer and confirm education, achievements, and experiences appear inside one **Achievements & experience** panel; for an old profile with only legacy achievement or experience text, confirm the fallback remains visible. As an admin, open `/admin-tutors` and verify structured experience entries render readably in the review card and pending-change panel. Repeat the same short-viewport check in the admin tutor-review drawer; body overscroll may bounce locally, but the header and review actions must remain fixed. Repeat with an intentionally stale review tab/version and confirm the API returns a conflict without overwriting the newer values.

Open **View details** from both `/achievements` and `/admin-achievements`. Confirm Status retains its semantic badge beneath the field label, while Category, Level, Subjects, Award, Awarded, and Location use the same label/value hierarchy. Below the `sm` breakpoint, confirm the detail opens from the bottom, stays usable within the viewport, and dismisses with a downward swipe. At `sm` and wider, confirm it opens from the right and dismisses with a rightward swipe. Resize across the breakpoint while the drawer is open and confirm its placement and dismissal direction update together. Open both available attachment types and confirm image URLs render in the preview, **Open original** launches the source in a new tab, and a non-image or inaccessible URL shows the preview-unavailable fallback without removing the original link.

### Tutor profile validation and action smoke check

Open `/profile` as a tutor with a draft or changes-requested profile. Leave one
required top-level field empty and click **Save draft**; confirm the profile
progress saves without submitting for review. Enter a short bio with 51 words
and confirm the counter, inline error, and validation summary say to use 50
words or fewer. Enter an invalid URL, an invalid year, or an invalid honorarium
and confirm the exact control receives the red invalid state and inline message,
while the validation summary lists the same field. Click **Submit for review**
with multiple missing fields and confirm all missing fields are listed and the
first invalid control receives focus. Fix the fields, submit again, and verify
the existing review transition and redirect to `/dashboard` still occur. For a
server-side rejection, confirm the returned missing-field, word-count, or
pricing detail highlights the corresponding form area rather than showing only
a generic toast.

Open a published tutor with **Changes under review**, edit another profile
field, and confirm **Save profile changes** remains enabled and updates the
pending proposal without changing the live public value. Confirm
**Submit changes for review** validates and queues the latest version, and that
the tutor remains editable while the admin review is pending.

### Profile UX smoke check

As a student, choose a JPG, PNG, or WebP profile photo up to 5 MB. Confirm the
crop dialog shows a circular guide, dragging repositions the image, and zoom
changes the visible area. Choose **Use this photo**, confirm the account card
shows the uploaded-photo state, then select **Save account details**. Reload the
page and verify the cropped image appears in the account card and authenticated
sidebar avatar. In R2 mode, the network request should be a `PUT` to the
presigned S3 endpoint and return success; a CORS failure means the bucket policy
does not include the current frontend origin. Confirm an unsupported file type
or oversized file is rejected, and that cancelling the crop leaves the previous
photo unchanged.

### Tutor experience formatting smoke check

Open `/profile` as a tutor and verify the Experiences subsection of the combined Achievements & experience section accepts up to five role, organization, start-year, end-year, and description entries. Leave End year blank for ongoing work, confirm year inputs stay as plain digits without grouping dots, verify an end year before the start year is rejected on review submission, and confirm structured entries persist in the public discovery drawer and admin review card while legacy `experiences` text still renders as a fallback.

Open `/profile` as a student and as a tutor at desktop and narrow widths. Verify the account card shows the current name, profile image (or initials), and read-only sign-in email; changing the name or image enables only the account save action. On a new student account without a profile row, confirm the student page still opens with an empty editable form and does not require the wallet/tutor aggregate request. On the student page, learning and parent/guardian fields use separate sections with one learning-profile save action. On the tutor page, the shell title and sidebar item say **Tutor Profile**, profile status and review feedback remain visible, the public profile section is separated from the teaching setup row, the honorarium preview is one combined modality matrix, fields are grouped into public profile/teaching setup/availability sections, and the final action card offers draft save plus submit-for-review only when the profile is editable. Verify the tutor profile scrolls through the same page-level shell container as the student profile, with no inner form scrollbar or large blank region after the action card; inspect the shell, tutor wrapper, and onboarding root and confirm the wrapper's natural height covers the full form rather than shrinking to the viewport. The action card must remain in normal document flow, and shorter specialization categories should not stretch to the height of the longest category. Opening `/onboarding` as a tutor should redirect to `/profile`. As an admin, verify the avatar menu has no **Profile** item and opening `/profile` redirects to `/dashboard`. In the payout-account form, verify all four account details plus ownership and disclaimer confirmation are required, the conventional-BCA/non-BCA fee copy is visible, and BCA Syariah and blu (BCA Digital) are not treated as fee-free. Confirm the browser console has no runtime errors and that the updated payout fields remain private to the tutor/admin surfaces.

For a tutor, confirm the public-profile editor exposes one **Name** field backed by Better Auth `user.name` and no second tutor-profile name. Save a changed name and verify the sidebar, tutor discovery, booking, dashboard, and admin review all render the updated account name; changing unrelated tutor-profile fields must not introduce or display `tutorProfile.displayName`.

The authenticated shell shows a session-expiry warning during the final 30 minutes of Better Auth's seven-day session. The warning includes a sign-in-again action; an API `401` remains the fallback redirect for expired sessions.

### Development

```bash
bun run dev              # Starts web + server (port 3001)
bun run dev:server       # Server only
bun run dev:web          # Web only (port 3000)
```

### Production

```bash
bun run build            # Build server + web
NODE_ENV=production bun apps/server/dist/index.mjs
```

The server runs on port 3001 by default (configurable via `PORT` env var).

## Database

### Start PostgreSQL (Docker)

```bash
bun run db:start         # Starts PostgreSQL (dev DB cogito-app) on port 6767
bun run db:test          # Starts isolated test PostgreSQL + Redis (docker-compose.test.yml) on port 6767
```

> Note: the dev and test PostgreSQL containers both map host port 6767 — do not run `db:start` and `db:test` simultaneously. `db:test` uses `docker-compose.test.yml` (repo root) and the test harness targets `cogito-test` via `apps/server/.env.test(.example)`.

> **Shutdown noise (C6):** stopping the Postgres container while the app still holds pooled connections prints `FATAL: terminating connection due to administrator command` lines — that is normal fast-shutdown, not a failure. Postgres has a `stop_grace_period: 30s` in both compose files; stop the app (or `docker compose stop` the app service) **before** the DB so connections drain cleanly. On Coolify, set a stop grace period ≥ 30s for the app so graceful shutdown (redis quit + DB drain) can finish before SIGKILL.

### Run Migrations

```bash
bun run db:migrate       # Apply pending migrations
bun run db:generate      # Generate new migration from schema changes
```

Migration `0038_room_booking_overlap_guard.sql` enables PostgreSQL `btree_gist` and adds `room_booking_confirmed_no_overlap`. Before applying it to an existing environment, query for overlapping `confirmed` room assignments and resolve any duplicates; PostgreSQL will refuse the constraint if conflicting historical rows exist. The range is half-open (`[start,end)`), and the API conflict queries use the same strict boundaries, so back-to-back room sessions are valid. The migration requires a database role allowed to install the trusted `btree_gist` extension (or an operator must pre-install it).

Contact sharing uses migration `0030_bouncy_madrox.sql`, which adds
`student_profile.allow_contact_requests` and the `contact_request` table. Apply
the migration before starting an API build that includes the Contact Module;
the reviewed migration is intentionally limited to those contact-sharing
changes.

If tutor discovery returns `500` with a missing `subject_category` or
`tutor_profile_subject` relation, the local database is behind migration
`0029_competition_taxonomy.sql`. Apply that migration (or the equivalent reviewed
pending migration) and restart the server. `bun run db:push` can detect broad
schema drift and ask ambiguous rename questions; review those prompts instead
of accepting unrelated changes blindly.

Tutor profile achievement fields require migration `0039_secret_blink.sql`.
Run `bun run db:migrate` before starting an API build that includes the
structured achievement editor; it adds JSONB `education` and
`competition_achievements` columns with empty-array defaults. Existing
`credentials_summary` text is intentionally preserved as the public fallback,
so this migration does not require a data backfill.

Tutor profile experience fields require migration `0040_colossal_morlun.sql`.
Run `bun run db:migrate` before starting an API build that includes the
structured experience editor; it adds JSONB `experience_entries` with an
empty-array default. Existing `experiences` text is intentionally preserved
as the compatibility fallback, so this migration does not require parsing or
data backfill.

Tutor Terms of Service acceptance requires migration
`0042_nappy_thunderbird.sql`. Run `bun run db:migrate` before starting an API
build that includes the first-submit consent flow; it adds nullable
`tutor_profile.terms_of_service_accepted_at` and
`tutor_profile.terms_of_service_version`. Existing rows are not backfilled;
the first accepted submission records version `2026-09`.

Human-readable booking references require migration
`0043_cheerful_blockbuster.sql`. Run `bun run db:migrate` before starting an
API/web build that displays or searches booking numbers. It adds the global
PostgreSQL-backed `booking.booking_number` sequence, assigns numbers to
existing bookings, and enforces uniqueness. Numbers are immutable and may have
gaps after rolled-back inserts; this is expected and is not a migration or data
integrity failure. No manual backfill or environment variable is required.

The IDR economy and admin rate-control surface require migration
`0028_economy_config.sql`. Run `bun run db:migrate` before starting the server;
it adds `tutor_profile.base_rates_idr`, creates the singleton
`economy_config` row with client-approved defaults, and is safe to rerun.

With the migration present, selecting a category or specialization
should execute the normalized relation filter and return either matching
tutors or an empty list—not a `500`. If only filtered requests fail, restart
the server after the latest API build and inspect the emitted SQL for the
`tutor_profile_subject`/`subject_category` filter aliases.

If `support.listTickets` returns `500` and the server log reports a missing
`support_ticket` relation, apply migration `0013_grey_sphinx.sql` and restart
the server. The procedure reads this table directly; a missing relation is a
database migration problem, not an empty ticket list.

For isolated local test runs, the test runner migrates `cogito-test` automatically
using `apps/server/.env.test` or `apps/server/.env.test.example`.

#### Migration rollback

Up migrations are the only automatic path; rollback SQL for the 2026 taxonomy
and IDR-economy migrations lives here (NOT inside the migration files —
drizzle-kit executes each file as one batch, so embedded down-DDL would run
immediately after the up-DDL). Rollback is a manual `psql` operation against
the target database, ordered newest-first:

```sql
-- 0028 economy config down
DROP TABLE IF EXISTS "economy_config";
ALTER TABLE "tutor_profile" DROP COLUMN IF EXISTS "base_rates_idr";

-- 0027 subject taxonomy down
DROP TABLE IF EXISTS "tutor_profile_subject";
DROP TABLE IF EXISTS "subject_category";
```

Order matters (0028 before 0027 is fine either way; children before parents for
0027). There is **no** automatic CD rollback — revert the code first, then run
the down SQL, then re-run `bun run db:migrate` to restore the journal state
consistently. `drizzle-kit` does not execute `-- down` sections; they exist for
manual recovery only.

### Seed the Database

```bash
# Default mark packages are installed by migration 0041_seed_mark_packages.sql.
bun run seed-packages          # Optional local/test or explicitly approved recovery tool
```

Production guard: `NODE_ENV=production bun run seed-packages` will exit with an error unless `SEED_ALLOWED_IN_PROD=true` is explicitly set. Do not run it as part of normal deploys: the CD migration step applies `0041_seed_mark_packages.sql` automatically and safely. Use the command only for local/test setup or an explicitly approved recovery. The full `bun run seed` command uses the same guard and additionally requires `SEED_ADMIN_PASSWORD`, `SEED_TUTOR_PASSWORD`, and `SEED_STUDENT_PASSWORD` (minimum 12 characters). In production it creates a dedicated local-login review admin from `SEED_REVIEW_ADMIN_EMAIL` and refuses to reuse an operator address from `ADMIN_EMAILS`. Set the review student/tutor emails explicitly, run the seed once, then remove all seed passwords and `SEED_ALLOWED_IN_PROD` from the deployment environment. Never provide the Google Calendar account password to a reviewer.

The full production/staging seed creates or reuses the separate review address
from `SEED_REVIEW_ADMIN_EMAIL` and sets its role to `admin`. Independently, on
every production-like server boot, the `ADMIN_EMAILS` operator allowlist
promotes matching existing accounts
case-insensitively without demoting other admins. A matching account created
after boot is promoted by the Better Auth signup hook. Set `ADMIN_EMAILS` to a
comma-separated list when more than one trusted account should be bootstrapped.
Other admin accounts may still be granted through the existing admin role UI/API.

Default catalog values follow PRD OQ-01: Starter 50 Marks / Rp 312,500, Learner 120 Marks / Rp 690,000, Explorer 200 Marks / Rp 1,070,000, Pioneer 400 Marks / Rp 2,000,000. Migration `0041_seed_mark_packages.sql` inserts missing rows and updates those name/Marks/price fields when a matching code already exists, while preserving an existing `is_active` choice. Seed demo students are marked email-verified so the local booking smoke flow can exercise the verified-student guard without an external OTP provider. To change the catalog after deployment, use the admin mark-package API; do not delete rows because payment records reference the package id and retain amount/Marks snapshots.

If production is currently missing packages, deploy the migration and verify with:

```bash
bun run db:migrate
```

Then call `adminMarkPackage.list` as an admin and confirm the four default codes are present. The next normal CD deployment runs this migration automatically; no per-deploy seed command or server-boot seed is required.

### Reset the Database

```bash
# Stop and remove the Docker container, then recreate:
docker compose down -v
bun run db:start
bun run db:migrate
# Migration 0041 inserts the default mark-package catalog.
```

Test database reset:

```bash
docker compose -f docker-compose.test.yml down -v
bun run db:test
```

### Drizzle Studio (Database GUI)

```bash
bun run db:studio        # Opens Drizzle Studio on port 4983
```

## Backup & Restore

### How the nightly backup works

Every night at **02:00 WIB** (`Asia/Jakarta`) a cron job on the VPS runs
[`infra/backup.sh`](../infra/backup.sh), which:

1. Dumps the production database with `pg_dump --no-owner --no-acl -Fc` (custom
   format, gzip-compressed — the file is still named `backups-YYYY-MM-DD.sql.gz`).
2. Uploads it to Cloudflare R2 via the `aws` CLI
   (`--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto`)
   under `s3://cogito-backups/backups/YYYY-MM-DD.sql.gz`.
3. Prunes R2 objects older than `RETENTION_DAYS` (default **30 days**).

**Failure self-check (2026-09-05):** any failing step (dump, upload,
verify, prune) posts a Discord `CRITICAL: nightly backup FAILED during
<step>` alert naming the step, and preflight problems (missing env,
unresolvable DB host, missing CLI tools, empty dump) abort loudly before
any snapshot or upload. Without `DISCORD_WEBHOOK_URL` the failure is loud
on stderr + exit 1.

**RPO (accepted 2026-09-05):** **24h** — the nightly dump plus the CD
pre-migrate snapshots (`pre-migrate-<sha>.sql.gz`, newest 7 kept) are the
recovery points (see `docs/FAILURES.md` DR-2/DR-3). Continuous WAL
archiving (point-in-time recovery) is the documented future path, not
implemented: it would ship WAL segments to `cogito-backups/wal/` alongside
the nightly base dumps.

The cron job, the `pg_dump` package, the decrypted credential file
(`/etc/cogito/backup.env`, root-only `0600`, decrypted from the SOPS vault on
the control node — the age key never reaches the VPS) and log rotation
(`/var/log/cogito-backup.log`, 7 daily files) are all installed by the
idempotent playbook [`infra/ansible/backup-cron.yml`](../infra/ansible/backup-cron.yml):

```bash
ansible-playbook -i infra/ansible/inventory.ini \
  infra/ansible/backup-cron.yml --ask-become-pass
```

**AWS CLI note (verified 2026-08-31):** Ubuntu noble dropped the `awscli` apt
package, so the playbook detects the existing AWS CLI v2 at
`/opt/cogito-actions-tools/bin/aws` (installed for the CD runner) instead of
apt-installing it. **DB-host resolution (dynamic since 2026-09-05):** the
vault keeps the Coolify-private hostname (e.g. `noxeaeuxfreq0axa9unpew5r`);
`infra/backup.sh` rewrites it to the container IP on the `coolify` network
at runtime (`getent` → `docker inspect`) and aborts loudly pre-snapshot when
the host is unresolvable — the operator never hand-maintains a container IP
(the old `10.0.1.8:5432` note below is one resolved value, not config).

(Or, during an apply window, `./infra/apply.sh backup-cron` — same playbook
with the DATABASE_URL reachability gate built in; see
[`infra/APPLY-RUNBOOK.md`](../infra/APPLY-RUNBOOK.md) §0.)

The playbook runs the backup as **root** (documented in the playbook header):
the single-tenant VPS is already root-managed, and the script needs the full
`DATABASE_URL` plus the R2 token either way, so a dedicated `backup` user
would duplicate credentials without adding isolation.

> **Before first run:** `DATABASE_URL` in the SOPS vault keeps the
> Coolify-private hostname (e.g. `postgres-prod` or the app's private-network
> hostname — reachable only inside the Docker network). The backup script
> resolves it to the container IP at runtime and aborts loudly when it
> cannot, so no hand-maintained IP is needed.
> `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
> `R2_SECRET_ACCESS_KEY` come from the same vault; the token needs Object
> Read & Write on the bucket.

### Manual run and verification

```bash
# Print the exact commands without executing (no credentials needed):
/usr/local/bin/cogito-backup.sh --dry-run
# Run one backup now:
DATABASE_URL=... R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
  /usr/local/bin/cogito-backup.sh
```

Verify a backup exists and is the expected size:

```bash
aws s3 ls s3://cogito-backups/backups/ \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto
```

A fresh nightly backup should appear by ~02:10 WIB. Missing backups surface as
an empty `backups/` listing plus the cron log at `/var/log/cogito-backup.log`.

### Restore drill

The nightly dumps are **custom-format** (from `pg_dump -Fc`) — restore them
with `pg_restore`, not `psql`. Practice this on a scratch database before ever
needing it in anger:

```bash
# 1. Pull the latest backup and decompress the custom-format dump.
aws s3 cp s3://cogito-backups/backups/$(date +%F).sql.gz . \
  --endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com --region auto
gzip -dc backups-$(date +%F).sql.gz > backup.dump

# 2. Restore into a scratch database (NOT the live one).
createdb cogito-restore-drill
pg_restore --no-owner --no-acl -d cogito-restore-drill backup.dump

# 3. Verify against known-good expectations: row counts, newest rows.
psql -d cogito-restore-drill -c "SELECT count(*) FROM \"user\";"
psql -d cogito-restore-drill -c "SELECT count(*) FROM booking;"
# Compare with the live database; also spot-check the newest ledger rows and
# a recent booking state history.
```

**Promoting the drill to a real restore** (disaster recovery, not a drill):

1. **Never restore over live traffic without a maintenance window.** Pick a
   low-traffic slot, put the API in maintenance (or stop the `cogito-api`
   resource in Coolify), and take a fresh pre-restore snapshot of the current
   database in case the restore must be abandoned.
2. Restore the verified dump into the production database:
   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl -d <PROD_DATABASE_NAME> backup.dump
   ```
3. If the backup predates pending migrations, run `bun run db:migrate` with
   the production `DATABASE_URL` (see DEPLOYMENT.md — migrations are never
   automatic).
4. Start the API and verify `/health` (database + Redis + scheduler `ok`) and
   the smoke checks in this runbook before reopening traffic.

Backups are retained 30 days; a restore older than that requires the R2
bucket's lifecycle configuration to have kept the object, so verify any
emergency restore against the actual object list first.

## Monitoring & Alerting (Uptime Kuma + Discord + disk watchdog)

### What is wired

- **Uptime Kuma** runs as a Coolify **service** (`cogito-uptime-kuma`,
  `louislam/uptime-kuma:2`, port 3001, volume `uptime-kuma-data:/app/data`)
  at **https://status.cogitoacademy.id** (DNS `status.` record is
  Terraform-owned). It is declared **declaratively through the Coolify API**
  by [`infra/ansible/uptime-kuma.yml`](../infra/ansible/uptime-kuma.yml) —
  the same control-node pattern as `coolify-resources.yml` (tunnel to
  `localhost:8000`, SOPS decrypt on the control node, idempotent, drift
  PATCHed). Nothing is installed on the VPS host directly.
- **Discord alerting**: the webhook URL is a bearer secret stored in the
  SOPS vault as `DISCORD_WEBHOOK_URL`. Kuma posts monitor alerts to the ops
  Discord channel; the disk watchdog posts disk warnings. **Wired
  2026-09-02** — the `COGITO ALERT` Discord notification is attached to all
  four Kuma monitors (see `docs/KUMA-RUNBOOK.md` for the live state and the
  two root causes fixed that day: the 503-flap from `maxretries=0` during CD
  deploys, and the empty `monitor_notification` that silently killed Discord
  alerting).
- **Disk watchdog**: [`infra/ansible/disk-watchdog.yml`](../infra/ansible/disk-watchdog.yml)
  installs `/usr/local/bin/cogito-disk-watchdog.sh` + a nightly cron
  (**03:30 WIB**) that warns at **≥ 85%** disk and auto-prunes at **≥ 92%**
  (see [Disk thresholds & auto-prune](#disk-thresholds--auto-prune)).

### Setup steps (one-time, operator)

1. **Add `DISCORD_WEBHOOK_URL` to the SOPS vault** (the playbooks print this
   instruction loudly when the key is missing; they never invent a URL):
   ```bash
   sops infra/secrets/prod.env
   # add: DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
   ```
   Create the webhook first: ops Discord server → channel (e.g.
   `#cogito-alerts`) → Settings → Integrations → Webhooks → New Webhook.
2. **Declare the Kuma service** (tunnel up, from the repo root):
   ```bash
   ssh -i ~/.ssh/cogito_vps -f -N -L 8000:127.0.0.1:8000 ubuntu@<tailnet-ip>
   ansible-playbook -i infra/ansible/inventory.ini infra/ansible/uptime-kuma.yml
   ```
   The playbook creates the service from the built-in `uptime-kuma`
   one-click template, applies `https://status.cogitoacademy.id`, starts it,
   and probes the domain. Re-runs are no-ops (drift-checked).
3. **Install the disk watchdog**:
   ```bash
   ansible-playbook -i infra/ansible/inventory.ini \
     infra/ansible/disk-watchdog.yml --ask-become-pass
   ```
4. **Configure Kuma** — **DONE 2026-09-02** (operator UI pass; the Coolify
   API cannot express Kuma's monitors). Live state: `api-health` (keyword
   `"status":"ok"`, `maxretries=2`), `web-app`, `DLQ DEPTH` (keyword
   `"dlqDepth":0`, `maxretries=3`), the `COGITO ACADEMY` group, the
   `COGITO ALERT` Discord notification attached to all monitors, and the
   `cogito` status page at `status.cogitoacademy.id`. The click-by-click
   runbook and the read-only verification query live in
   `docs/KUMA-RUNBOOK.md`. Two root causes were fixed during the pass:
   - **503-flap** — `maxretries=0` recorded DOWN on every CD deploy (the
     API container restarts and `/health` 503s while the new image boots).
     Fixed with `maxretries=2` + `retry_interval=60`.
   - **Discord silent** — the notification existed but no monitor was
     attached (`monitor_notification` empty). Fixed by attaching it to every
     monitor.
   - Not yet created: `api-cert` / `app-cert` certificate monitors
     (recommended follow-up).

### What alerts arrive

| Alert                                                      | Source               | Meaning                                                           | Response                                                      |
| ---------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Kuma: api /health down                                     | Kuma monitor         | API unreachable or `status != ok` (DB/Redis/scheduler degraded)   | `./ops.sh health`, `./ops.sh status`, check Coolify logs      |
| Kuma: app down                                             | Kuma monitor         | Web app unreachable                                               | `curl -sI https://app.cogitoacademy.id`, Coolify web resource |
| Kuma: cert expiring                                        | Kuma monitor         | TLS cert for `api.`/`app.` near expiry (monitors not yet created) | Traefik/Let's Encrypt renewal check                           |
| Kuma: dlqDepth > 0                                         | Kuma keyword monitor | A **fresh** DLQ failure landed in the last 24h                    | `./ops.sh dlq` to see what failed                             |
| Discord: "VPS disk at N%"                                  | disk watchdog        | Disk ≥ 85%                                                        | `./ops.sh disk`; plan cleanup                                 |
| Discord: "CRITICAL: VPS disk still at N% after auto-prune" | disk watchdog        | Disk ≥ 92% **after** the prune ladder                             | Operator action required — see below                          |
| Grafana: DLQFresh / DiskWarn / DiskCrit / ApiErrors         | Grafana alert rules  | Same signals as above, evaluated from Prometheus (1m)             | Same responses; Grafana is the second pair of eyes             |

### Observability stack (LIVE 2026-09-05 — Loki + Prometheus + tailnet Grafana)

Declared by [`infra/ansible/observability.yml`](../infra/ansible/observability.yml)
(Coolify services `cogito-loki` / `cogito-prometheus` / `cogito-grafana` /
`cogito-alloy`, all tailnet-only, no public domains). Retention: Loki 30d,
Prometheus 15d. 2G swap live on the VPS (2026-09-05) with per-service memory
limits in the composes.

- **Logs without SSH:** Grafana → Explore → Loki datasource →
  `{service="cogito-api"} |= "<traceId>"` (resource names are the
  suffix-stripped Coolify names: `cogito-api`, `cogito-web`, `cogito-prod-db`,
  …). Or `./infra/ops.sh trace <traceId>` for the Explore URL.
- **Grafana access (tailnet-only):** `ssh -L 3000:127.0.0.1:3000
  ubuntu@<tailnet-ip>`, then `http://localhost:3000` (admin user `admin`;
  password in the SOPS vault as `GRAFANA_ADMIN_PASSWORD`). Provisioned:
  datasources (Loki default + Prometheus), 4 dashboards (App RED, Logs &
  Traces, Infra, Delivery), alert rules (DLQFresh/DiskWarn/DiskCrit/ApiErrors
  → `Discord-ops` contact point).
- **Prometheus targets** (all UP 2026-09-05): `cogito-api` (Bearer
  `metrics_token`), `node-exporter`, `cadvisor`.
- **Networking lesson (recorded so nobody re-learns it):** each Coolify
  service gets its OWN Docker network — bare service names do NOT resolve
  across services. All obs traffic rides the shared `cogito-obs` Docker
  network (one-time `docker network create cogito-obs`); human access rides
  VPS-loopback publishes (`127.0.0.1:3000/3100/9090/9100/8081`) + SSH
  tunnels. Nothing obs-related is public.
- **Gotchas fixed during apply:** Coolify API requires base64
  `docker_compose_raw`; Alloy component is `loki.source.docker` (not
  `docker_logs`); Loki 3.x needs `delete_request_store: filesystem` with
  retention; `reject_old_samples_max_age` raised to 720h (first connect
  backfills container history); Prometheus container user can't read a 0600
  token file (0644); cAdvisor moved to loopback `:8081` (host `:8080` is
  held by an old docker-proxy).

### Drizzle Studio ownership (LIVE 2026-09-05 — `cogito-studio`)

Coolify service `cogito-studio` (app `drizzle-gateway`,
`ghcr.io/drizzle-team/gateway`, volume `drizzle-gateway-data`). It was
`unhealthy` for 11 days (wedged vendor healthcheck + dead sslip.io domain);
revived 2026-09-05 by service restart + loopback publish
(`127.0.0.1:4983`, PATCHed compose) — status `healthy`, UI serves 200.

- **Access:** `ssh -L 4983:127.0.0.1:4983 ubuntu@<tailnet-ip>`, then
  `http://localhost:4983`. No public domain by design (DB GUI).
- **Credentials:** managed in the Coolify service env (UI → cogito-studio →
  Environment, `SERVICE_PASSWORD_DRIZZLE`); never in our vault (Coolify-owned
  secret, like the Coolify API token pattern).
- **Operate:** restart via Coolify UI or `POST
  /api/v1/services/tzhidx0p18mvbbpuaeahcxwy/restart` (Bearer
  `COOLIFY_API_TOKEN`); health via Coolify status or the UI port check.
  The vendor `healthcheck.js` (5s timeout) is flaky — treat Coolify status +
  UI 200 as truth, not the container health flag alone.
- **Guardrails:** read anytime; writes only in maintenance windows, never
  during a deploy. `./infra/ops.sh studio` (tunnel + local Studio) remains
  the alternative path.

### Disk thresholds & auto-prune

The watchdog (`/usr/local/bin/cogito-disk-watchdog.sh`, cron 03:30 WIB,
log `/var/log/cogito-disk-gc.log`, rotated 7) appends one heartbeat line
per run — `heartbeat disk_pct=N verdict=ok|warn|pruned` (2026-09-05, M3) —
so log-shipping and the operator can tell "watchdog alive" apart from
"watchdog silent because the disk is fine":

- **≥ 85%**: posts `VPS disk at N% — cleanup recommended` to Discord.
- **≥ 92%**: runs the prune ladder, then re-checks:
  1. `docker image prune -f` (dangling images only);
  2. `docker image prune -af --filter until=48h` (unused images older than
     48h);
  3. re-tags the newest 1–2 local `ghcr.io/cogitoacademy/app` images as
     `rollback-keep-*` so the CD rollback candidates survive (GHCR remains
     the authoritative rollback source — `migrate-and-deploy.sh` re-pulls
     `v<PREV_GIT_SHA>`).
- **NEVER deletes**: volumes, active containers' images, postgres data
  (`docker image prune` semantics + the explicit keep-list). A `--dry-run`
  mode prints the exact commands without executing or posting:
  ```bash
  /usr/local/bin/cogito-disk-watchdog.sh --dry-run
  ```
- Rationale: Coolify's built-in `docker_cleanup` (threshold 80, daily)
  failed to prevent the 2026-08-31 incident (99% disk: 28GB of dangling
  images, Redis `MISCONF` stop-writes-on-bgsave-error, failed image
  extraction, a stalled Coolify deployment). This watchdog is the
  independent second line.

If the CRITICAL alert fires, act: `./ops.sh disk` to see what is large,
then remove the offender (e.g. old backups, large volumes — never the
postgres volume) and re-run the watchdog manually.

### Disk watchdog verification (after first install)

The watchdog (`/usr/local/bin/cogito-disk-watchdog.sh`, cron 03:30 WIB) was
installed 2026-09-02 while the disk was at 99% (31G of 38G in
`/var/lib/containerd` — dangling Docker images, 25.8G reclaimable). The
operator's `docker image prune -f` reclaimed the space (99% → 36%, verified
2026-09-02 17:33 UTC: 14G of 38G used). Verify the watchdog works:

1. `./infra/ops.sh disk` — record `df -h /` usage.
2. After 03:30 WIB: `sudo cat /var/log/cogito-disk-gc.log` — expect a
   `check:` line and, if ≥92%, a `prune ladder` run with the post-prune
   usage.
3. `./infra/ops.sh disk` again — usage should be below 85% if the prune
   ran. If not: run the ladder manually
   (`sudo /usr/local/bin/cogito-disk-watchdog.sh --force-prune`) and check
   the log for errors.
4. If the watchdog never ran (no log file): check the cron entry
   (`sudo crontab -l -u root`) and that `/etc/cogito/disk.env` exists with
   `DISCORD_WEBHOOK_URL` (the playbook writes it; a missing key logs
   "webhook not set" but the watchdog still runs).

> **2026-09-02 status:** installed (binary + cron + env present), first run
> pending — `/var/log/cogito-disk-gc.log` did not exist yet at 17:33 UTC
> (the 03:30 WIB run had not fired). Re-verify after the first 03:30 WIB run.

### Memory headroom (recommended, not yet applied)

The VPS has 3.8G RAM, **no swap**, and **no container memory limits**
(verified 2026-09-02: all containers `Memory: 0`). Recommended hardening
(deferred — operator decision; do NOT apply from a worker — operator
console/VPS steps, see the checklist in the wave report):

- Add 2G swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
&& sudo mkswap /swapfile && sudo swapon /swapfile` (+ fstab entry:
  `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab`, then verify
  with `free -m`).
- Set Coolify per-resource memory limits (Coolify UI → resource → Advanced
  → Memory limit):
  - Existing: API 512M, Redis 256M, Postgres 512M, Kuma 256M.
  - Observability stack (declared by `infra/ansible/observability.yml`;
    limits are also in each service's compose `mem_limit`, the API-service
    limit below is the UI step): Loki 300M, Prometheus 256M, Grafana 256M,
    Alloy 128M, node_exporter 64M, cAdvisor 128M.

### Observability stack (PLG, tailnet-only — declared, not yet applied)

Loki + Prometheus + Grafana + Alloy (+ node_exporter + cAdvisor) are
declared by [`infra/ansible/observability.yml`](../infra/ansible/observability.yml)
(2026-09-05, control-node driven like `uptime-kuma.yml`, idempotent). The
playbook is syntax-checked only — the operator applies it (tunnel up) per
the printed steps; nothing here was applied from a worker.

- **Tailnet-only (hard requirement):** no observability service has a public
  domain (`urls: []`, drift-checked). Grafana is reached over the tailnet
  (`http://<tailnet-ip>:3000`) or an SSH tunnel — there is deliberately no
  public log UI.
- **Provisioned files** (source of truth in git; the operator places them
  once under `/etc/cogito/observability/` per the playbook's printed
  commands): `infra/prometheus/prometheus.yml` (scrapes api `/metrics` with
  the vault `METRICS_TOKEN` via a token file, 15s interval; node_exporter +
  cAdvisor), `infra/loki/loki-config.yml` (30d retention), `infra/alloy/config.alloy`
  (`loki.source.docker_logs` over the Docker socket — never file globs under
  `/var/lib/docker`), Grafana datasources + 4 dashboards (App RED, Logs &
  Traces with traceId/userId search, Infra with the 85%/92% disk lines,
  Delivery with deploys/backups/DLQ/breakers).
- **Retention vars** (single tuning point in the playbook):
  `LOKI_RETENTION_DAYS=30`, `PROM_RETENTION_DAYS=15`. **Lean fallback** for a
  tight VPS (documented, not applied): scrape_interval `30s` in
  `prometheus.yml` + `--storage.tsdb.retention.time=7d` in the prometheus
  compose (halve both vars first so the declaration stays truthful).
- **Trace lookup without SSH:** `./infra/ops.sh trace <traceId>` prints the
  tailnet Grafana Explore URL (LogQL `{service="cogito-app-server"} |=
"<traceId>"`). Logs carry `userId`, never email.
- **Grafana → Discord** (Grafana UI step, like the Kuma monitors — the
  Coolify API cannot express it): Alerting → Contact points → Discord with
  the vault `DISCORD_WEBHOOK_URL`; suggested rules DLQFresh
  (`dlq_fresh_depth > 0`), DiskWarn/DiskCrit (85%/92%), ApiErrors (5xx %
  canary) — see the playbook's printed steps.

### Redeploy / retry procedure (the 'CD red but box recovered' case)

The 2026-08-31 disk event showed the exact failure shape: the CD deploy
step went red because the queued Coolify deployment failed on a full disk
(image extraction failed), while the box itself was healthy. The recovery
flow, verified in that event:

1. **Confirm the box recovered**: `./ops.sh health` (all `ok`) and
   `./ops.sh disk` (usage back under the thresholds).
2. **Re-run the failed CD run from the GitHub Actions UI** — this is **safe**
   because the pipeline is idempotent:
   - `pg_dump` snapshot → R2 (`pre-migrate-<GIT_SHA>.sql.gz`) — a re-run
     overwrites the same key; no data loss.
   - `bun run db:migrate` — Drizzle migrations are journaled; already-applied
     migrations are no-ops.
   - Coolify deploy webhook — re-POSTing the same image is a no-op redeploy.
   - sha-verified health poll — the gate that proves the new image serves.
     In the Actions UI: failed run → **Re-run failed jobs** (or Re-run all
     jobs). Alternatively, one command:
   ```bash
   ./ops.sh deploy-retry    # gh run rerun for the last CD run; falls back to
                            # POSTing the Coolify deploy webhook with the
                            # vault Bearer token (never echoed)
   ```
3. **Verify**: `curl -s https://api.cogitoacademy.id/health` — `version`
   must equal the merged commit sha, and `checks.*` all `ok`.

> **Never** "fix" a red CD by deploying manually from a laptop while the
> runner is mid-flight — the `production-deploy` concurrency group would
> queue a second migration. Re-run the failed run instead.

### CD does not auto-retry (the 2026-09-02 disk-full incident class)

`cd-prod.yml` has **no retry** — a failed run stays red until someone
re-runs it or the next merge to main happens (the workflow has no paths
filter, so **any push to main re-triggers CD**). The 2026-09-02 incident
(#174–#178) showed the exact shape: the host disk was 99% full, Coolify's
image pull died mid-extraction (`failed to extract layer ... no space left
on device` in `application_deployment_queues.logs`), the deploy webhook was
accepted (`deployment queued`) but the container never switched from
`bb1ccb9a` (still serving, healthy). Recovery procedure:

1. **Free disk first** — the watchdog auto-prunes at ≥92% (03:30 WIB), but
   do not wait for it during an incident:
   ```bash
   ./infra/ops.sh disk                       # confirm the diagnosis
   sudo docker image prune -f                # dangling images (reclaimed 25.3GB, 99% → 36% on 2026-09-02)
   # if still ≥92%: sudo docker image prune -af --filter until=48h
   ./infra/ops.sh disk                       # verify < 85%
   ```
2. **Re-run the failed CD run** (safe — snapshot/migrate/deploy are
   idempotent): `./infra/ops.sh deploy-retry` (or Actions UI → failed run →
   Re-run failed jobs). The wave PR's squash-merge to main is the
   alternative re-trigger — do NOT push to main from a worker branch.
3. **Verify**: `curl -s https://api.cogitoacademy.id/health` — `version`
   must equal the merged commit sha, and `checks.*` all `ok`.

> The old container keeps serving while the deploy is stuck — a disk-full
> deploy failure is a stuck deploy, not an outage. Fix the disk, then
> re-run.

### Operator follow-ups

- ~~Add `DISCORD_WEBHOOK_URL` to the SOPS vault~~ — **done** (vault has it,
  encrypted #149).
- ~~Kuma UI paste for monitors + Discord notification~~ — **done 2026-09-02**
  (see `docs/KUMA-RUNBOOK.md` for the live state and the two root causes
  fixed: 503-flap from `maxretries=0`, and the empty `monitor_notification`
  that silenced Discord).
- Recommended: add `api-cert` / `app-cert` certificate monitors in the Kuma
  UI (not yet created).
- Optional: add `DISCORD_WEBHOOK_URL` as a GitHub secret if the CD should
  post deploy failures to Discord (not wired — noted only).

## Redis

### Check Redis Connection

```bash
redis-cli ping           # Should return PONG
redis-cli info server    # Server info
```

### Application Health Check

```bash
curl http://localhost:3001/health
# Returns: { "status": "ok", "checks": { "database": "ok", "redis": "ok", "scheduler": "ok" }, "timestamp": "..." }
```

`checks.scheduler` mirrors Redis reachability (`ok`/`error`/`degraded`) because the BullMQ scheduler runs on the same Redis — an `error` there means the booking-expiry/hold-release/email/SLA jobs are not running and the readiness check trips (503).

When investigating `cogito-jobs-dlq`, expect one entry only after the source
job has exhausted its configured BullMQ attempt count. A failure with retries
remaining is intentionally absent from the DLQ; inspect the source queue's
attempt counter and backoff state instead.

**DLQ depth is age-aware (fresh failures only).** Since 2026-08-31 each entry
pushed to `cogito:dlq` carries `failedAt` (epoch ms, stamped at push time by
the DLQ worker). `/health` `dlqDepth` counts only entries whose `failedAt` is
within the freshness window — default **24 hours**, overridable via the
`DLQ_FRESH_WINDOW_HOURS` env var (plain integer; an invalid, zero/negative,
or > 1-year value falls back to 24h). **Entries without `failedAt` — the
pre-2026-08-31 ledger — and any non-JSON payload are treated as STALE and
never count**, so an old batch (e.g. the 2026-08-25 one) no longer trips the
alert forever. This is alert hygiene, not data loss: the full ledger remains
in Redis for `ops.sh dlq` inspection and `dlq-clear` still removes it. An
entry exactly 24h old counts as stale (the window is a strict `failedAt >
now − window` comparison).

**Scheduler boot failure mode:** with `SCHEDULER_ENABLED=true`, `initScheduler()` pings Redis first and **throws if unreachable — the API boot aborts**. This is intentional: a silently dead scheduler (no expiry/hold-release/email jobs) is worse than a failed deploy. Fix Redis (or set `SCHEDULER_ENABLED=false` for a scheduler-less instance) and redeploy.

Redis is **mandatory** (`REDIS_URL` is required — the server won't boot without it). The in-memory stores are defensive fallbacks only when a configured Redis call fails at runtime; they are per-process and degrade cross-instance guarantees.

### Clear Rate Limit Keys

```bash
redis-cli KEYS "cogito:rl:*"       # List rate limit keys
redis-cli DEL "cogito:rl:127.0.0.1" # Clear specific key
redis-cli --scan --pattern "cogito:rl:*" | xargs redis-cli DEL  # Clear all
```

### Reset Circuit Breaker State

```bash
redis-cli KEYS "cogito:cb:*"       # List circuit breaker keys
redis-cli DEL "cogito:cb:google_meet"  # Reset Google Meet circuit
redis-cli DEL "cogito:cb:resend"       # Reset Resend circuit
redis-cli DEL "cogito:cb:xendit"       # Reset Xendit circuit
redis-cli DEL "cogito:cb:midtrans"     # Reset Midtrans circuit
```

### Monitor BullMQ Jobs

```bash
redis-cli KEYS "cogito-jobs:*"     # List all job keys
redis-cli LLEN "cogito-jobs:wait"  # Jobs waiting
redis-cli LLEN "cogito-jobs:failed" # Failed jobs
redis-cli ZCARD "cogito-jobs:delayed" # Delayed jobs
```

## Test and Coverage

Run the CI-equivalent coverage suite from the repository root after starting the test Postgres and Redis services:

```bash
bun test --coverage --coverage-reporter=lcov --timeout 30000 packages/api/src/tests/ packages/env/src/ packages/auth/src/ packages/db/src/ apps/server/src/openapi.test.ts
```

For the contact-sharing regression path, run the database-preparing wrapper
with the focused integration test, then the Playwright privacy spec against the
local web/API stack:

```bash
bun scripts/run-test-suite.mjs api packages/api/src/tests/integration/contact-sharing.test.ts
bun scripts/run-test-suite.mjs e2e --grep "identity surfaces"
```

The workflow runs this single coverage-instrumented suite and then runs the
server suite in a separate process because its webhook test uses module
mocking. The previous duplicate uninstrumented API pass is intentionally not
run. Test + Coverage starts independently from lint and typecheck. The
coverage comment script enforces 100% coverage for `packages/api` lines,
overall lines, functions, and branches from `coverage/lcov.info`; a 0/0 branch
total is treated as 100%. If this gate fails, inspect the missing function/line
records in the generated lcov report and add a behavior-level test before
pushing. A failed coverage test command is also propagated explicitly after
the comment step. The Bun command's own function/statement output is
diagnostic; the lcov gate is authoritative.

The CI lint job uses the pinned oxlint 1.80.0 and oxfmt 0.65.0 toolchain. It
emits **documented-intentional warnings**: `no-await-in-loop` = sequential
money/DB writes in booking/wallet paths (parallelizing would risk money
correctness), plus `consistent-function-scoping` and `no-underscore-dangle`
style conventions. Known legacy React compiler errors are tracked in
`.github/lint/baseline.txt`; new errors fail `.github/lint/check-baseline.ts`.
They are triaged, not regressions — see `docs/plans/active/CI-SANITY.md` F13.
The local pre-push hook invokes this same baseline gate; `bun run lint` remains
the raw diagnostic command and is expected to report the baselined errors.
Do not "fix" the warnings by parallelizing the loops or by silencing the rules
in `.oxlintrc.json` (that config is shared with the local run). The lint
auto-fix commit sets `LEFTHOOK=0`; the baseline and format steps remain the
authoritative CI gates.

## Common Errors

### Google OAuth `state_mismatch`

This means Better Auth could not validate the short-lived OAuth state. Confirm
the browser received `better-auth.state` from the API before navigating to
Google and sent it back on `GET /api/auth/callback/google`. In production the
session cookies remain `SameSite=Strict`, but the OAuth state cookie must be
`SameSite=Lax` because Google returns through a top-level `GET` navigation.
Clear cookies for `api.cogitoacademy.id` and retry once in a clean browser;
do not open multiple Google sign-in attempts in parallel or refresh the
callback URL. If the cookie is present but the error persists, verify that
`BETTER_AUTH_SECRET` is stable across the deployment and that the shared
database contains the verification record. Do not disable
`skipStateCookieCheck`/CSRF checks as a workaround.

### `BOOKING_CONFLICT` (409)

Two bookings overlap the same tutor time slot. The overlap check uses an exclusion constraint on `tutor_id` + time range. Wait for the other booking to expire or cancel.

### `INSUFFICIENT_BALANCE` / `INSUFFICIENT_MARKS` (400)

Student's `availableBalance` is less than the required hold amount. Check wallet balance via `wallet.getOrCreate`.

### `BOOKING_STATE_TRANSITION` (409)

Invalid state machine transition. Check `booking-transitions.ts` for valid transitions.

For rescheduling, `reschedule_proposed` must return to the state captured in `booking.previousState` after unanimous acceptance or rejection. A partial acceptance must leave both the current schedule and `reschedule_proposed` state unchanged. If a decision reports that no pending proposal exists, refresh booking detail: the supplied `proposalId` may belong to a superseded proposal.

When a 24-hour reschedule proposal deadline passes, expire only the proposal. Keep the original schedule and wallet holds, restore `booking.previousState`, and do not cancel the provider meeting event.

Acceptance/rejection calls also reject an already expired proposal. Final acceptance rechecks the tutor and series-session target under advisory locks; `BOOKING_CONFLICT` at this stage means the proposed slot became occupied after it was proposed and a fresh time must be proposed.

### `BOOKING_NOT_EDITABLE` while creating a booking (400)

Confirm the chosen start is inside the selected tutor availability window and leaves the full server-fixed 90 minutes before the window ends. The web form shows the valid start range and blocks invalid submissions. Also verify the availability is active and that no non-terminal booking overlaps the requested session; declined, cancelled, and expired bookings should not keep the time blocked.

### Contact request errors

- `NOT_FOUND` — the viewer is not a participant in the booking, or the request
  does not exist.
- `BAD_REQUEST` — the booking is not `completed`, the peer is not an eligible
  student participant, or the peer has disabled new contact requests.
- `FORBIDDEN` — someone other than the request recipient attempted to respond.
- `CONFLICT` — the request was already created or has already been answered;
  refresh the booking detail before retrying.

### `LAST_ADMIN` (409)

Attempted to remove the last admin role. Promote another user to admin first.

### `OPTIMISTIC_LOCK` (409)

Concurrent modification conflict. The `version` field didn't match. Retry the operation.

### Circuit Breaker Open Errors

- `Email service unavailable: 503` — Resend circuit breaker is open. Wait 2 minutes or reset manually.
- `Google Meet API timeout after 30s` — Google Meet circuit breaker is open. Wait 1 minute or reset manually.
- `Payment provider error` — the active provider's circuit breaker is open (Xendit `cogito:cb:xendit` / Midtrans `cogito:cb:midtrans`). Wait 30 seconds or reset manually.
- `Payment simulation error: 403 REQUEST_FORBIDDEN_ERROR` — verify the production key is a Test Mode secret (`xnd_development_...`) with **Money-in / Payments → Write** permission, while `XENDIT_MODE=test`; then create a fresh purchase.
- `Payment simulation error: 400 INACTIVE_PAYMENT_METHOD` — the dynamic QR has already been completed, canceled, or expired. On the patched build, retrying once performs an authoritative status reconciliation; if it still fails, use a fresh pending intent rather than retrying the inactive QR indefinitely.
- `Payment simulation error: 400 ...` — inspect the Xendit error code/message for amount mismatch or another request validation failure. Do not retry an old payment indefinitely; create a fresh pending intent after correcting the request/configuration.
- `Payment provider error: 503 ...` on Explorer (Rp 1,070,000) / Pioneer (Rp 2,000,000) only — **Xendit Test Mode amount cap (~IDR 1,000,000)**. Starter/Learner work; all four packages work in Live Mode (QRIS channel limit is 1–10,000,000 IDR). For UAT use Starter/Learner, or temporarily lower the package price below 1M via the admin mark-package API. The Balance page labels Explorer/Pioneer in Test Mode.
- Re-purchase behavior — a PAID, SETTLED, FAILED, EXPIRED, or REFUNDED attempt is retained as history and the next `payment.createPurchase` call creates a new payment row/provider reference. Only the latest PENDING attempt is reused. Test transactions in the production database therefore do not permanently lock a package for the UAT account.

### Database Connection Errors

- `ECONNREFUSED` — PostgreSQL not running. Run `bun run db:start`.
- `ECONNREFUSED` during tests — Start the isolated test DB with `bun run db:test`.
- `connection timeout` — Check `DATABASE_URL` in `.env`.
- `server does not support SSL` or repeated `db_retry` in Coolify — Coolify's
  bundled PostgreSQL is non-TLS. Set `DB_SSL_ENABLED=false` on the API service,
  redeploy, and keep `DB_SSL_REJECT_UNAUTHORIZED=true` for any deployment where
  `DB_SSL_ENABLED=true`.

### Test Safety Guard

- `Refusing to run tests against a non-test database` — The test harness detected a `DATABASE_URL` whose database name does not include `test`.
- `resetDatabase() is blocked outside a dedicated test database` — An integration test tried to truncate tables while pointed at a non-test database.

### Role-boundary errors

- `FORBIDDEN: Student access required` is expected when tutor/admin sessions call tutor-discovery or student booking mutations. Use protected `booking.listMine`/`booking.get` for the shared booking read surface, `tutorActions.*` for tutor fulfillment, and `adminTutor.*`/`adminBooking.*` for admin review. The protected booking detail/list/session/availability reads are outside the 30/minute mutation limiter; a `Too Many Requests` response on one of these reads indicates a limiter regression.

### Redis Connection Errors

- `ECONNREFUSED` — Redis not running. Start it (`bun run db:start` brings up postgres + redis). Redis is required; the server fails fast on env validation if `REDIS_URL` is missing.

## Rollback a Deployment

Deployments are Coolify auto-deploys from GHCR images (`ghcr.io/cogitoacademy/app/{server,web}`). Rollback is done in Coolify:

1. Open the Coolify dashboard → the service (server / web)
2. Use **Rollback to previous release** (Coolify keeps the previous image/version)
3. Verify health **and the deployed sha**: `curl https://api.cogitoacademy.id/health` must return `"version": "<full-commit-sha>"` matching the image you intended to run. The CD pipeline (`scripts/migrate-and-deploy.sh`) polls `/health` until `version == GIT_SHA` (bounded 20×15s) and fails loudly with a rollback hint if the new image never comes up — a green deploy now means the _new_ image is serving, not merely "some container is up".
4. If a database migration was part of the deployment, check migration status:
   ```bash
   bun run db:studio  # Check migration table
   ```
5. Roll back migrations if needed (rare — coordinate with DBA)

## Agent Herd

Parallel development with a lead agent and skill-gated worker agents on top of Herdr. Prereqs: `herdr` + `herd` installed (`~/.local/bin/`), you are inside a Herdr-managed pane (`echo $HERDR_ENV` → `1`).

Roles:

- **Lead** (`~/.config/opencode/agents/lead.md`): plans, proposes the per-goal worker roster, spawns/monitors/verifies workers. The lead never spawns workers without user approval and never resolves a worker `blocked` state on its own — it escalates to the user first.
- **Workers** (`.opencode/agents/worker-*.md`): `worker-frontend` (frontend-design), `worker-review` (code-review, read-only), `worker-feature` (feature-workflow), `worker-core` (engineering-core), `worker-prod` (production-reliability). Each is skill-gated via `permission.skill` (`*` denied, one allowed) so unrelated skill bodies never load in its context, and carries anti-loop rules (never re-run a command that already produced output).

### Dispatch one goal across workers

```bash
# 1. Per unit of work, create an isolated worktree + branch (required for parallel
#    write-capable workers — they must never share a working directory)
herd worktree feat/f1-admin-dashboard    # cwd defaults to the repo; creates workspace + pane

# 2. Spawn a worker pinned to its role (passes --agent <role> to the opencode process)
herd-spawn-worker w-frontend worker-frontend /path/to/worktree

# 3. Submit a self-contained brief (goal / scope / constraints / acceptance criteria /
#    WORKER-REPORT.md contract / escalation rule — workers cannot see the lead's conversation)
herd prompt w-frontend "Implement F1 per docs/plans/active/FRONTEND-GAPS-SPEC.md. Scope: apps/web. Use the frontend-design skill. Write WORKER-REPORT.md at repo root; stop and report rather than guess."

# 4. Monitor — block, never sleep-poll
herdr agent wait w-frontend --timeout 300000   # blocks until idle/done/blocked
herd read w-frontend                            # inspect output / a blocked question

# 5. User answers a blocked worker directly, e.g. to type a password
herd attach w-frontend                         # detach: ctrl+b q

# 6. Verify before integrating (never trust "done"): read WORKER-REPORT.md,
#    run bun run check + bun run check-types per worker, review the diff,
#    diff worker file sets against each other to catch overlaps.
```

### Integration (PR + CI + squash-merge)

Worker branches are never merged directly into main:

```bash
# 1. Rebuild the wave as a clean feature branch from origin/main with
#    Conventional Commits (type(scope): short description + body)
git checkout -b fix/waveN-<area> origin/main
# ... apply the verified changes in logical commits ...

# 2. Push + PR with a full body (Summary/Why/Implementation/Testing/Risks/Rollback/Notes)
git push -u origin fix/waveN-<area>
gh pr create --title "..." --body "..."

# 3. Wait for CI (blocking watch, never sleep-wait)
gh pr checks <n> --watch

# 4. Squash-merge when green
gh pr merge <n> --squash --delete-branch
```

Findings/concerns discovered during a wave are documented in `docs/plans/active/` in the same PR (planning-first, AGENTS.md rule 11).

### Lifecycle

- Detach the TUI (`ctrl+b q`) and the Herdr server keeps all panes/agents running headless; reattach with `herdr`. Remote/multi-device attach: `herdr --remote <ssh-target>` (see herdr docs, "Persistence and remote access").
- Worker approval/`blocked` states wait for a user; there is no fully unattended flow by design.
- Agent names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live agents.
- Cleanup: `herd` never closes panes/workspaces it didn't create; close finished worker panes explicitly.

## Environment Variables

Student account name/image editing uses the existing Better Auth session and requires no additional environment variables or database migration.

Key environment variables (see `.env.example` for full list):

| Variable                                                                                      | Required | Description                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                | Yes      | PostgreSQL connection string                                                                                                                                                                                                                                                     |
| `BETTER_AUTH_SECRET`                                                                          | Yes      | Auth secret key                                                                                                                                                                                                                                                                  |
| `BETTER_AUTH_URL`                                                                             | Yes      | API base URL for auth cookies (production: `https://api.cogitoacademy.id`)                                                                                                                                                                                                       |
| `CORS_ORIGIN`                                                                                 | Yes      | Allowed frontend origin (production: `https://app.cogitoacademy.id`)                                                                                                                                                                                                             |
| `PAYMENT_WEBHOOK_SECRET`                                                                      | Yes      | Webhook verification secret (provider-agnostic)                                                                                                                                                                                                                                  |
| `REDIS_URL`                                                                                   | Yes      | Redis URL (required since #48 — mandatory for boot)                                                                                                                                                                                                                              |
| `GOOGLE_CLIENT_EMAIL`                                                                         | No       | Google service account email                                                                                                                                                                                                                                                     |
| `GOOGLE_PRIVATE_KEY`                                                                          | No       | Google service account private key                                                                                                                                                                                                                                               |
| `GOOGLE_CALENDAR_ID`                                                                          | No       | Google Calendar ID for meeting creation                                                                                                                                                                                                                                          |
| `GOOGLE_IMPERSONATED_USER`                                                                    | No       | SA-mode impersonation address (REVIEW-FIXES-4 P4.2)                                                                                                                                                                                                                              |
| `GOOGLE_MEET_ENABLED`                                                                         | No       | Enables Google Meet provider (default false)                                                                                                                                                                                                                                     |
| `GOOGLE_MEET_CLIENT_ID`/`GOOGLE_MEET_CLIENT_SECRET`/`GOOGLE_MEET_REFRESH_TOKEN`               | No       | OAuth path credentials for Google Meet                                                                                                                                                                                                                                           |
| `RESEND_API_KEY`                                                                              | No       | Resend API key (required in production/staging — P4.1)                                                                                                                                                                                                                           |
| `EMAIL_FROM`                                                                                  | No       | Sender address (default `noreply@cogitoacademy.id`; must be a verified Resend domain in prod/staging)                                                                                                                                                                            |
| `ADMIN_EMAILS`                                                                                | No       | Comma-separated production/staging admin bootstrap emails (default `itcogitoacademy01@gmail.com`); existing admins are never demoted                                                                                                                                             |
| `XENDIT_SECRET_KEY`                                                                           | No       | Xendit API secret key (required when `PAYMENT_PROVIDER=xendit`); use a Test Mode key with Money-in / Payments **Write** permission while `XENDIT_MODE=test`                                                                                                                      |
| `XENDIT_WEBHOOK_TOKEN`                                                                        | No       | Xendit webhook verification token                                                                                                                                                                                                                                                |
| `XENDIT_MODE`                                                                                 | No       | Required when `PAYMENT_PROVIDER=xendit`: `test` for Xendit Test Mode or `live` for Live Mode. The matching Xendit API key selects the actual environment                                                                                                                         |
| `XENDIT_TEST_ALLOWED_EMAILS`                                                                  | No       | Comma-separated verified student emails allowed to create purchases when `XENDIT_MODE=test` in production/staging; required there to prevent unrestricted sandbox-funded Marks                                                                                                   |
| `XENDIT_SUCCESS_REDIRECT_URL` / `XENDIT_FAILURE_REDIRECT_URL`                                 | No       | Required when `PAYMENT_PROVIDER=xendit` (P3.7)                                                                                                                                                                                                                                   |
| `WEBHOOK_ALLOWED_IPS`                                                                         | No       | Webhook source IP allowlist (comma-separated). **Required in production/staging when `PAYMENT_PROVIDER=xendit`** (D2) — the env schema rejects boot with an empty allowlist so the endpoint is never open to every IP                                                            |
| `SCHEDULER_ENABLED`                                                                           | No       | Starts the BullMQ worker + repeatable jobs (default false). **Required `true` in production/staging (D3)** — the env schema rejects boot with it false, since a prod server without the scheduler silently skips booking expiry, hold release, email dispatch and SLA escalation |
| `TRUST_PROXY`                                                                                 | No       | Trust `x-forwarded-for` first hop for client IP (default false) — required behind a reverse proxy so rate limiting and webhook IP checks see real client IPs                                                                                                                     |
| `DB_SSL_ENABLED`                                                                              | No       | Enable TLS for the PostgreSQL connection (default true); set false for Coolify's bundled non-TLS PostgreSQL                                                                                                                                                                      |
| `DB_SSL_REJECT_UNAUTHORIZED`                                                                  | No       | Reject unauthorized TLS certificates on the DB connection (default true)                                                                                                                                                                                                         |
| `METRICS_TOKEN`                                                                               | No       | Bearer token for the metrics endpoint                                                                                                                                                                                                                                            |
| `UPLOAD_DIR`                                                                                  | No       | Local upload directory when R2 is not configured (default `./uploads`)                                                                                                                                                                                                           |
| `SANITY_PROJECT_ID`                                                                           | No       | Sanity project id (defaults to the Cogito Academy project; set explicitly per deployment)                                                                                                                                                                                        |
| `SANITY_DATASET`                                                                              | No       | Sanity dataset (defaults to `development`; production/staging must set the intended published dataset)                                                                                                                                                                           |
| `SANITY_API_VERSION`                                                                          | No       | Sanity API version in `YYYY-MM-DD` format (default `2024-03-01`)                                                                                                                                                                                                                 |
| `SANITY_API_TOKEN`                                                                            | No       | Server-only token for private Sanity datasets; never add it to `apps/web`/`VITE_*` variables                                                                                                                                                                                     |
| `XENDIT_DEFAULT_PAYMENT_METHOD`                                                               | No       | Default Xendit channel (`ewallet_ovo`/`qris`/`va_bca`; default `qris`). QRIS uses a dynamic QR payload rendered by the Balance page.                                                                                                                                             |
| `MIDTRANS_SERVER_KEY`                                                                         | No       | Midtrans Snap Server Key (required when `PAYMENT_PROVIDER=midtrans`); Sandbox keys (`SB-Mid-server-…`) for `MIDTRANS_MODE=test`, Production keys (`Mid-server-…`) for `live`. The key selects the actual environment                                                             |
| `MIDTRANS_CLIENT_KEY`                                                                         | No       | Midtrans Snap Client Key (required when `PAYMENT_PROVIDER=midtrans`)                                                                                                                                                                                                             |
| `MIDTRANS_MERCHANT_ID`                                                                        | No       | Midtrans merchant id (required when `PAYMENT_PROVIDER=midtrans`)                                                                                                                                                                                                                 |
| `MIDTRANS_MODE`                                                                               | No       | Required when `PAYMENT_PROVIDER=midtrans`: `test` for Midtrans Sandbox or `live` for Production. The matching Server Key selects the actual environment                                                                                                                          |
| `MIDTRANS_WEBHOOK_SIGNATURE_KEY`                                                              | No       | Optional dedicated webhook signature key; when unset the Server Key verifies the notification `signature_key` (SHA512 of order_id+status_code+gross_amount+key)                                                                                                                  |
| `SESSION_COOKIE_CACHE_MAX_AGE`                                                                | No       | Better Auth session-cookie cache max age in seconds (default 60)                                                                                                                                                                                                                 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` | No       | Cloudflare R2 upload backend (required in production/staging — P4.3)                                                                                                                                                                                                             |
| `R2_BACKUP_BUCKET`                                                                            | No       | Private R2 bucket used only for database backups; keep separate from the public upload bucket                                                                                                                                                                                    |
| `SEED_ALLOWED_IN_PROD`                                                                        | No       | Seed-script production guard                                                                                                                                                                                                                                                     |
| `SEED_REVIEW_ADMIN_EMAIL` / `SEED_REVIEW_TUTOR_EMAIL` / `SEED_REVIEW_STUDENT_EMAIL`           | No       | Dedicated local-login reviewer identities. The review admin must not be present in `ADMIN_EMAILS`; never use the Google Calendar operator account.                                                                                                                               |
| `SEED_ADMIN_PASSWORD` / `SEED_TUTOR_PASSWORD` / `SEED_STUDENT_PASSWORD`                       | No       | One-time seed inputs, all required in production/staging with at least 12 characters. Remove them from the deployment environment immediately after seeding.                                                                                                                     |
| `STUB_WEBHOOK_ALLOWED`                                                                        | No       | Stub-checkout E2E flag; the stub checkout endpoint only serves `development`/`test` — staging always returns 404 (prod-fixes C2)                                                                                                                                                 |

## Real-Provider Swap (Resend / Xendit / Google Meet / R2)

The app defaults to dev-safe stand-ins (stub email, stub payments, manual Meet fallback, local-disk uploads). Before a production launch these must be swapped for real providers. What fails **loud** vs **silent**, and what each swap requires:

| Provider    | Dev default          | Silent-failure mode if misconfigured                                                                                                      | Prod requirement (fail-loud guard PR)                                                                                                                        |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resend      | Stub (no-op email)   | **Silent** — `RESEND_API_KEY` optional, no `NODE_ENV` check; critical emails suppressed with no alert                                     | `RESEND_API_KEY` required when `NODE_ENV` is production/staging + verified `EMAIL_FROM` domain (P4.1)                                                        |
| Xendit      | Stub provider        | Wrong mode key/token, or unrestricted production sandbox purchases                                                                        | `XENDIT_MODE` + matching Test/Live key/token + redirect URLs; production/staging Test Mode also requires a UAT email allowlist; sandbox E2E before live (P3) |
| Midtrans    | Stub provider        | Wrong mode key, or a Sandbox key used in production (sandbox payments never settle real money)                                            | `MIDTRANS_MODE` + matching Sandbox/Production Server Key + Client Key + merchant id; sandbox E2E before live (see `docs/MIDTRANS-MIGRATION.md`)              |
| Google Meet | Manual link fallback | **Boot warning + fallback** — a failed probe is logged and online bookings fall back to manual/retry handling until credentials are fixed | Complete credential set + `GOOGLE_IMPERSONATED_USER` (SA mode) + successful boot probe (P4.2)                                                                |
| R2          | Local `UPLOAD_DIR`   | **Silent** — prod without R2 writes to container-local disk, lost on redeploy; R2 set but `R2_PUBLIC_URL` unset → objects unreachable     | All `R2_*` + `R2_PUBLIC_URL` required in production/staging (P4.3)                                                                                           |

> **Midtrans (2026-09-03):** the Midtrans Snap provider is implemented behind
> the same `PaymentProvider` port (`docs/MIDTRANS-MIGRATION.md`). Snap returns
> a hosted `redirect_url`; the webhook `signature_key` is verified in the body
> (`SHA512(order_id + status_code + gross_amount + signature key)`); statuses
> map `capture`→PAID (fraud `accept`), `settlement`→SETTLED, `pending`→PENDING,
> `deny/cancel/failure`→FAILED, `expire`→EXPIRED, `refund/partial_refund`→
> REFUNDED. `order_id` is the payment UUID (unique per repurchase attempt).
> Midtrans Sandbox has **no simulation endpoint** — `canSimulate` is false and
> sandbox test payments use the Snap test cards. `PAYMENT_PROVIDER=midtrans`
> requires `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY`/`MIDTRANS_MERCHANT_ID`/
> `MIDTRANS_MODE` (fail-loud env guard). Xendit remains the default and the
> rollback path.

> **P3 status (2026-08-17; idempotency hardened 2026-08-29):** the Xendit provider was rewritten for `api-version: 2024-11-11` — `request_amount`/`channel_code`/`channel_properties`, top-level response with `actions[].value` (REDIRECT_CUSTOMER → PRESENT_TO_CUSTOMER), statuses ACCEPTING_PAYMENTS/SUCCEEDED/REQUIRES_ACTION/AUTHORIZED/CANCELED, webhook lifecycle keys from provider + `data.payment_id`/`payment_request_id` + normalized status (with provider-reference fallback), and a provider `refund()` port (migration 0025 adds `payment_record.provider_request_id`). The status component ensures a later paid/refunded lifecycle event is not hidden by an earlier event for the same payment; an identical retry still deduplicates. Timestamp validation is provider-conditional (skipped for xendit — L4). `XENDIT_SUCCESS/FAILURE_REDIRECT_URL` are required by the env schema when `PAYMENT_PROVIDER=xendit` (P3.7). **N1 (2026-08-19):** the provider `refund()` port is **no longer wired into `adminRefund`** — admin refunds are in-app Marks credits only (`refund_record.amount_idr = 0`, `provider_event_id` NULL); no Xendit cash refund is ever issued from `adminRefund` (PRD §677: Marks not convertible to rupiah).

### Xendit go-live checklist (production switch)

The production app can run Xendit Test Mode first. The switch to Live Mode happens only after the production-domain UAT checklist below passes:

1. **Pre-flight:** run the sandbox checklist above against the sandbox keys. Confirm `XENDIT_DEFAULT_PAYMENT_METHOD` matches the launch channel (default `qris`).
2. **Webhook wiring:** set the Xendit dashboard webhook URL to `https://api.cogitoacademy.id/webhooks/payments/xendit` and confirm the dashboard sends the `api-version: 2024-11-11` payload shape (`data.payment_id` / `data.payment_request_id`). The webhook idempotency key derives from the verified payload id/reference plus normalized lifecycle status — no `x-callback-token` guessing. During UAT, send the same paid payload twice (the second must be idempotent), then verify a different lifecycle status for the same payment is not suppressed.
3. **Env:** in the SOPS-encrypted prod env, set `XENDIT_MODE=live` and replace the Test Mode `XENDIT_SECRET_KEY`/`XENDIT_WEBHOOK_TOKEN` with Live Mode credentials. Keep the redirect URLs, update the webhook configuration to Live Mode, and set `WEBHOOK_ALLOWED_IPS` to the live egress IPs from Xendit. The env schema fails boot if `PAYMENT_PROVIDER=xendit` lacks credentials or an explicit mode, so a half-swapped config cannot silently run the stub.
4. **Live smoke:** run one real small purchase (Pioneer 400 / Rp 2,000,000 or the smallest approved package) end-to-end: create purchase → Xendit checkout → webhook → wallet credit once. Verify the redirect return works and the balance page reflects the credit.
5. **Negative tests:** deliver a webhook with a wrong token (rejected), from a non-allowlisted IP (rejected), and a duplicate delivery (idempotent — single credit).
6. **Refund path:** confirm an `adminRefund` writes `refund_record` with `amount_idr = 0` and `provider_event_id` NULL — no Xendit cash refund is ever issued (PRD §677).
7. **Rollback:** keep Test Mode keys/token and the UAT allowlist in the SOPS vault under separate named entries. Roll back by restoring `XENDIT_MODE=test` plus the Test Mode credentials/allowlist and redeploying; use `PAYMENT_PROVIDER=stub` only as an emergency fallback. Document the switch timestamp and transaction reference in the ops log.

### Xendit sandbox verification checklist (L4)

Steps to validate the Xendit integration on the production domain before accepting real payments. Xendit Test/Live is selected by the API key; `NODE_ENV` stays `production` throughout this checklist.

1. In Coolify, set `PAYMENT_PROVIDER=xendit`, `XENDIT_MODE=test`, the Xendit Test Mode secret key and Test Mode `x-callback-token`, both redirect URLs, `XENDIT_TEST_ALLOWED_EMAILS` for the approved verified UAT accounts, and the Test Mode webhook egress IPs in `WEBHOOK_ALLOWED_IPS`. Keep `STUB_WEBHOOK_ALLOWED=false`.
2. In the Xendit Dashboard, switch to **Test Mode** and configure the webhook URL `https://api.cogitoacademy.id/webhooks/payments/xendit` for the payment events used by the current API. Test and Live webhook settings are separate; use the Test Mode callback token in Coolify.
3. Sign in with an allowlisted verified student account and create a purchase with `XENDIT_DEFAULT_PAYMENT_METHOD=qris`. Confirm the Balance page renders the dynamic QR from Xendit's `PRESENT_TO_CUSTOMER` action. A non-allowlisted account must receive `403` from `payment.createPurchase`.
4. Click **Simulate successful payment** below the QR. The button is emitted only for an approved UAT account in Xendit Test Mode and calls Xendit's test-only payment-request simulation endpoint. Completion is asynchronous by webhook; while waiting, app polling also reconciles against [`GET /v3/payment_requests/{payment_request_id}`](https://docs.xendit.co/apidocs/get-payment-request) so a delayed/rejected sandbox callback cannot leave a remotely completed payment stuck. Never attempt to pay the sandbox QR with a real banking app.
5. Confirm the webhook reaches the production API with `api-version: 2024-11-11`, `data.payment_id` or `data.payment_request_id`, and `status=SUCCEEDED`; the payment becomes `PAID` and Marks are credited once. Check the boot log for `action=payment_provider_configured` and `xenditMode=test`; the secret must never appear in logs.
6. Verify the wrong Test Mode token returns 401, a non-allowlisted webhook source returns 403, a duplicate webhook is idempotent, and a REFUNDED webhook follows the reconciliation rules. Xendit timestamp validation is intentionally skipped because the current integration relies on `x-callback-token`.
7. Record the test payment IDs and remove/expire the UAT data or use dedicated test accounts before switching to Live Mode. Test transactions in the production database remain application data for reconciliation/audit, but terminal attempts no longer prevent the same account from purchasing that package again.
8. Only after all checks pass, follow the go-live checklist and switch the key/token + `XENDIT_MODE` from `test` to `live`.

### Google Meet refresh-token acquisition (X3)

The repeatable setup is documented in [`docs/GOOGLE-MEET-SETUP.md`](GOOGLE-MEET-SETUP.md). Use the OAuth refresh-token path for a normal Gmail account; use the service-account path only with Workspace domain-wide delegation.

The short version for OAuth is:

1. Enable **Google Calendar API** in the Google Cloud project.
2. Add the calendar-owner account as an OAuth consent-screen **Test user**.
3. Create a **Web application** OAuth client and add exactly `https://developers.google.com/oauthplayground` as an authorized redirect URI. Do not use the deprecated OOB URI.
4. In OAuth Playground, enable **Use your own OAuth credentials**, authorize `https://www.googleapis.com/auth/calendar`, and exchange the code for tokens.
5. Put the returned `refresh_token` (not `access_token`) in `GOOGLE_MEET_REFRESH_TOKEN`, set the client credentials and `GOOGLE_MEET_ENABLED=true`, then restart the API.
6. Verify the startup log contains `google_meet_probe_ok` and accept a future online booking as the tutor. The booking should become `scheduled` with a `meet.google.com` URL.

The provider's OAuth probe calls the Calendar API calendar-list endpoint, so a token created with only `https://www.googleapis.com/auth/calendar.events` may create events but still fail the startup probe. Re-authorize with `https://www.googleapis.com/auth/calendar` if the log reports insufficient scopes. A failed probe is logged loudly and the app keeps the manual/fallback provider available; it is not a successful production configuration.

### Resend domain verification (X2 / P4.1)

The production env schema requires `RESEND_API_KEY` and a non-default `EMAIL_FROM` (the dev default `noreply@cogitoacademy.id` is rejected). Before enabling production email:

1. Resend dashboard → **Domains** → add `cogitoacademy.id` (and `staging.cogitoacademy.id` for staging).
2. Add the DNS records Resend provides (SPF/DKIM) at the DNS provider; wait for verification.
3. Set `EMAIL_FROM` to a verified address, e.g. `noreply@cogitoacademy.id` — the env schema rejects the dev default when `NODE_ENV` is production/staging, so the verified domain's address is fine.
4. Send a test invite/refund email on staging before enabling production email.

### Legacy account email verification

Accounts created before mandatory email verification remain `email_verified=false`; do not run a data backfill that marks them verified. On the next email/password or Google sign-in, the web client requests a fresh verification OTP and routes the account to `/verify-email`. After the code is accepted, the user continues to the original destination.

New email/password signups receive one combined welcome + verification email: it contains the onboarding/dashboard entry point, login link, platform introduction, and six-digit OTP. **Resend code** and verification for legacy accounts remain verification-only, so they do not repeat the signup welcome copy.

Manual signup smoke test:

1. Create a new email/password account with a fresh address.
2. Confirm exactly one auth email is delivered and that it contains both the welcome content and the six-digit verification code.
3. Enter the code on `/verify-email` and confirm the account reaches its normal destination.
4. Use **Resend code** and confirm the replacement message is verification-only.

Manual smoke test after an auth or web deploy:

1. Sign in with a pre-verification account whose `email_verified` value is `false`.
2. Confirm a verification email is delivered and the browser opens `/verify-email`.
3. Enter the six-digit code and confirm the account reaches its original destination.
4. Sign out and sign in again; confirm the account follows the normal role redirect without another verification step.
5. If the automatic email request fails, use **Resend code** on `/verify-email`; inspect the email-service logs and Resend configuration before retrying.

### R2 bucket + API-token setup (X4 / P4.3)

The production env schema requires all four `R2_*` vars together **and** `R2_PUBLIC_URL` when R2 is configured (partial config or a missing public URL fails loudly — no container-local disk fallback, no unreachable objects).

1. Cloudflare dashboard → **R2** → create a bucket (region `auto`).
2. **Manage R2 API Tokens** → create a token with Object Read & Write on the bucket → copy `ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` into `R2_ACCOUNT_ID` (your Cloudflare account id), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
3. Set `R2_PUBLIC_URL` to the public object URL (e.g. `https://media.cogitoacademy.id` via a custom domain, or the `r2.cloudflarestorage.com` endpoint). `GET /uploads/*` is disabled whenever `R2_PUBLIC_URL` is set (objects are served from R2 instead).
4. In the bucket's **CORS Policy** JSON tab, allow the frontend origins and the presigned PUT flow:

   ```json
   [
     {
       "AllowedOrigins": [
         "http://localhost:3000",
         "http://127.0.0.1:3000",
         "https://app.cogitoacademy.id"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. Verify an upload → the returned key resolves under `R2_PUBLIC_URL`.

> U3 CORS verified 2026-09-05 (read-only — Terraform has no CORS resource,
> so bucket CORS is console-managed like the R2 custom domain; no console
> change made): the policy above allows only `https://app.cogitoacademy.id`
> plus the two local dev origins, methods `GET`/`PUT`/`HEAD`, and the
> `Content-Type` header the presigned PUT signs. The nightly
> `infra/r2-upload-audit.sh` (list + HEAD, read-only) posts to Discord when
> an object's ContentType does not match its key's extension class.

## Deploy Secrets (CD webhooks)

The CD workflow (`cd-prod.yml`) triggers Coolify deploys via webhook. (`cd-staging.yml` was **deleted on 2026-08-31** — locked decision: prod-first, no staging exists; see below.) Since P4 (C3) the trigger **fails loudly** (`curl --fail --max-time 30`, no `|| true`) — if the webhook secret is missing or the request fails, the build goes red instead of silently doing nothing. Since the CD-pipeline hardening (2026-08-27) `cd-prod.yml` also **guards the secrets explicitly**: an unset `COOLIFY_PROD_SERVER_WEBHOOK` / `COOLIFY_PROD_WEBHOOK` prints a clear message ("... is unset — configure the Coolify resource webhook and add it as a GitHub secret") and exits 1 before any curl runs, so the failure mode is a readable message, not a bare `curl exit 6`.

**Setup (one-time, user action):**

1. Coolify → your service → **Webhooks** tab → copy the **Deploy webhook** URL.
2. The value to save is the **full URL**, not the separate Manual Git Webhook
   Secret. Use this format:

   ```text
   https://cl.cogitoacademy.id/api/v1/deploy?uuid=<resource-uuid>&force=false
   ```

   Replace `<resource-uuid>` with the Coolify resource UUID and remove the
   angle brackets. Keep `&` literal; do not add `\&`, backticks, quotes, or
   trailing `??`. The URL host must be publicly DNS-resolvable from GitHub
   Actions.

   > **Canonical host: `cl.cogitoacademy.id`** (renamed from
   > `coolify.cogitoacademy.id` on 2026-08-31 — the live Coolify host,
   > verified: 302 → /login). The Coolify control plane is tailnet-only — the
   > UI and SSH are reachable only over Tailscale — so a DNS record + Traefik
   > route expose **only** the deploy-webhook path on this host
   > (`cl.cogitoacademy.id/api/v1/deploy/*`; the per-resource UUID in the URL
   > is the bearer secret); everything else on that host returns 404/denied
   > and the Coolify UI stays tailnet-only.

   > **REQUIRED-OPERATOR-ACTION (2026-08-31):** the two GitHub secrets
   > `COOLIFY_PROD_SERVER_WEBHOOK` + `COOLIFY_PROD_WEBHOOK` currently point at
   > `https://coolify.cogitoacademy.id/...` and must be recreated with
   > `https://cl.cogitoacademy.id/api/v1/deploy?uuid=...` before the next
   > production deploy.

3. GitHub → repo **Settings → Secrets and variables → Actions**:
   - `COOLIFY_PROD_SERVER_WEBHOOK` — full production API resource URL
   - `COOLIFY_PROD_WEBHOOK` — full production web resource URL
   - (The staging webhook secrets are gone with `cd-staging.yml`, deleted
     2026-08-31 — see the staging note below. Do not recreate them.)
4. Current Coolify versions require a separate API token with the `deploy`
   permission. Store it as another Actions secret and have the workflow send
   `Authorization: Bearer <token>`; never append the token to the URL. See
   [Setup and Deployment](./DEPLOYMENT.md#5-configure-deploy-webhooks) for the
   full format and distinction from Manual Git Webhooks.
5. Push to `main` and verify the "Trigger Coolify deploy" step is green.

Until the secrets are set, CD pushes will fail at the trigger step by design (a silent no-op deploy is worse than a red build).

### Staging CD removed (2026-08-31, locked decision)

`.github/workflows/cd-staging.yml` was **deleted** (CI-SANITY F7, locked:
"prod first, no staging"). Rationale:

- No staging infrastructure exists — no staging host in Terraform/DNS, no
  staging Coolify project.
- The `COOLIFY_STAGING_SERVER_WEBHOOK` / `COOLIFY_STAGING_WEBHOOK` secrets
  were never set, and the documented example URLs pointed at the **same
  public Coolify host as prod** (`cl.cogitoacademy.id`). Had anyone set
  them, a "staging deploy" would have redeployed over the production
  Coolify instance.
- Pushing to the `staging` branch now runs **no CD at all** (CI PR runs
  still cover it). If staging is ever reintroduced, it returns with its
  own host and its own Coolify instance — never shared webhooks with prod.

## Test Environment

Tracked template:

```bash
apps/server/.env.test.example
```

Optional local override:

```bash
apps/server/.env.test
```

Default local test ports:

- Web: `3100`
- Server: `3101`
- PostgreSQL: `6767` (test container; shared with dev container — see note above)

Economy role checks:

```bash
bun scripts/run-test-suite.mjs api packages/api/src/tests/integration/economy-roles.test.ts
bun scripts/run-test-suite.mjs e2e --grep economy --reporter=line
```

The role suite covers student, tutor, and admin authorization plus the
admin-update → future-booking snapshot path. The E2E runner starts the isolated
web/server ports above and seeds deterministic role credentials.
Its setup resolves `student.seed@cogitoacademy.id` before clearing test bookings
and resets the test economy row to defaults, so repeated runs do not depend on
stale seeded state or a hard-coded user ID. Economy inputs are displayed with
locale grouping separators; the browser check edits them through the visible
control and verifies the numeric value after saving.

The 2026-09-05 browser regression exercised 14 tests across the four E2E specs,
including online group invite confirmation, accepted-online reschedule and
cancellation, tutor accept/decline, unauthorized booking access, the
future-booking economy snapshot, invalid negative IDR input, and narrow
viewport containment. The student auth state is saved under
`packages/e2e/.auth/` for the run and is ignored by git; this avoids exceeding
the production auth sign-in rate limit during a multi-role suite. The local
run also showed the expected Google Meet boot-probe failure for an
expired/revoked credential. Before a marketing recording, refresh the provider
credential and rerun the browser suite; with a broken provider the app
deliberately keeps an online booking `confirmed` and surfaces manual/retry
setup attention.

## GHCR / Docker Deploy (CD)

The CD workflow (`cd-prod.yml`; `cd-staging.yml` was deleted 2026-08-31 — see
[Deploy Secrets](#deploy-secrets-cd-webhooks) → "Staging CD removed") builds both images (`apps/server/Dockerfile`, `apps/web/Dockerfile`) and pushes to `ghcr.io/cogitoacademy/app/{server,web}`.

The production pipeline (`cd-prod.yml`) builds and pushes images on a GitHub-hosted runner, then runs the backup → migrate → deploy → health sequence on the production VPS runner labelled `production`. `scripts/resolve-private-db-url.sh` converts the Coolify-only database hostname to its current VPS-local container IP for that job without publishing PostgreSQL, then `scripts/migrate-and-deploy.sh` performs the release:

1. **Backup:** `pg_dump` snapshot of the production database, gzipped, uploaded to R2 as `pre-migrate-<GIT_SHA>.sql.gz` (aws CLI against the R2 S3 endpoint). **Databases are never restored automatically** — the snapshot exists purely for a reviewed, operator-driven restore/rollback decision.
2. **Migrate:** `bun run db:migrate` against the production `DATABASE_URL`.
   Turbo allowlists this variable for the `db:migrate` task so strict env mode
   passes it through to `drizzle-kit`.
3. **Deploy:** POST the configured Coolify server webhook. The workflow and script are restored to their last known successful `bb1ccb9a` implementation. Do not pull application images from the self-hosted VPS runner: the 2026-09-02 attempt filled the host disk and crashed the runner with `No space left on device`.
4. **Health (sha-verified):** poll `https://api.cogitoacademy.id/health` until `version == GIT_SHA` (bounded 20×15s ≈ 5 min).
5. **Auto-rollback (best-effort, restored `bb1ccb9a` behavior):** on poll timeout the script attempts its original Coolify application lookup/PATCH/redeploy sequence, then always prints the manual rollback hint and exits 1. This path requires application write permission and may be skipped or fail with the current deploy-only token; it is retained only because the CI/CD files were explicitly restored to the last successful state. Database snapshots are never restored automatically. **Rollback-perm truth (recorded 2026-09-05, operator to verify):** until a token-perm check proves otherwise, rollback is **manual-only** — Coolify UI → previous release (code) plus a reviewed snapshot restore (DB, DR-1/DR-2).
6. **Web verification (F3 2026-08-31):** a separate step POSTs the web deploy webhook (`COOLIFY_PROD_WEBHOOK`) and immediately runs `scripts/migrate-and-deploy.sh --poll-web`, which polls `HEALTH_URL_WEB` (default `https://app.cogitoacademy.id`) for plain **HTTP 200** (bounded 20×15s). The web image is static nginx with no version marker, so HTTP 200 is the verification signal; a poll timeout fails the job with a manual web-rollback hint (the web resource is not auto-rolled back — it would need a `COOLIFY_WEB_APP_UUID` secret that does not exist).

Runner triage:

```bash
sudo systemctl status 'actions.runner.cogitoacademy-app.cogito-prod.service'
sudo journalctl -u 'actions.runner.cogitoacademy-app.cogito-prod.service' -n 100 --no-pager
sudo -n docker inspect noxeaeuxfreq0axa9unpew5r --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}'
```

An indefinitely queued deploy means the runner is offline or lacks the
`production` label. A database resolution error means the Coolify database
container or network attachment changed; never expose port 5432 publicly.

The server image is built with `--build-arg GIT_SHA=${{ github.sha }}`; the Dockerfile bakes it into `ENV GIT_SHA`, and `GET /health` returns it as `version` (`"dev"` when unset, e.g. local runs). The web image is built with `--build-arg VITE_SERVER_URL=https://api.cogitoacademy.id`.

For the exact manual build, push, redeploy, verification, and rollback
procedure when Actions cannot start, use [Setup and Deployment](./DEPLOYMENT.md#manual-deployment-when-ci-has-no-quota).

If a push fails with `denied: installation not allowed to Create organization package`:

1. **Workflow permission (code, already fixed):** the job must declare `permissions: { contents: read, packages: write }` so the `GITHUB_TOKEN` can write to GHCR.
2. **Org-level (requires an org admin):** the `cogitoacademy` org must allow GitHub Actions to create packages. Either enable it in **Org Settings → Actions → General → Workflow permissions → "Read and write permissions"** (with "Allow GitHub Actions to create and approve pull requests" as needed), or initialize the packages once by pushing any image under `ghcr.io/cogitoacademy/app/{server,web}` with an org member account:
   ```bash
   docker pull oven/bun:1.3.14
   docker tag oven/bun:1.3.14 ghcr.io/cogitoacademy/app/server:init
   docker push ghcr.io/cogitoacademy/app/server:init   # repeat for /web
   ```
   After the packages exist, the workflows push without org changes.

## Tutor drawer scroll smoke check

Open a long tutor profile in the student discovery drawer and in the admin review
drawer on a short viewport. Scroll and overscroll the profile body; it may bounce
locally, but the header and booking/review footer must remain visible and must not
move with the body.

## Tutor payout operations (2026-08-28)

Apply migrations `0034_faulty_richard_fisk.sql`, `0035_ordinary_lyja.sql`, and `0036_worried_groot.sql` before deploying the tutor payout-account UI. Operations may process tutor honoraria weekly, but the balance does not reset on a calendar boundary. Review the unpaid amount, transfer the net amount, then call the admin mark-paid procedure; this advances the completion-time cutoff and clears only the sessions included in that payout. Completion and mark-paid operations are serialized per tutor to avoid a boundary race. Only conventional BCA (exact bank name `BCA`) is fee-free; BCA Syariah, blu (BCA Digital), and any other destination incur Rp2,500 once on that payout. The application records the payment audit trail but does not execute a bank transfer. Confirm the tutor's account number, holder name, opening city/regency, ownership choice, and transfer disclaimer before initiating the transfer.
