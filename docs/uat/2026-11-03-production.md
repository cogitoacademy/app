# Production UAT report — app.cogitoacademy.id and cogitoacademy.id

Date: 2–3 November 2026 (WIB). Payout retest: 2 November 2026, 23:38–23:47 WIB.

> Evidence note: screenshots, PDFs, and JSON artifacts referenced as `tmp/uat-prod/` are local UAT outputs and are not committed. This document records the observed results.

Environment: production
- App: https://app.cogitoacademy.id
- API: https://api.cogitoacademy.id
- Marketing: https://cogitoacademy.id (serves `/en` and `/id`)
- API version: `7cec271b3a18f499e647f803fdac253e7105b3e1`
- Browser: Microsoft Edge, driven through Playwright
- Accounts: `cogito.andre@yopmail.com`, `cogito.argya@yopmail.com`, `cogito.athena@yopmail.com` (students), `cogito.diego@yopmail.com` (tutor), `cogito.admin@yopmail.com` (admin)

Scope: app role journeys, class and enrollment lifecycle, report flow, booking lifecycle, payout lifecycle, FAQ, achievements, Knowledge Bank grants, activity and blog authoring, marketing site pages, role access control, and browser-clock time manipulation.

Verdict: **Accepted for all executable flows.** App, marketing, auth OTP, blog, KB/calendar authoring, and KOL non-payment flows pass. Live payment and the commission/settlement steps that depend on a real paid purchase were not executed. The database still needs the Sanity import or calendar seed to restore the full KB/calendar catalog.

## Result summary

| Area | Result |
| --- | --- |
| App public routes and auth page | Pass |
| Student, tutor, admin route walkthroughs | Pass |
| Role access control (student/tutor blocked from admin) | Pass |
| Class create, publish, Meet creation | Pass |
| Full, half, and single enrollment | Pass |
| Second installment payment | Pass |
| Single-seat cancellation with fee | Pass |
| Half-plan withdrawal with fee and retained seat | Pass |
| Late and early absence notices | Pass |
| Tutor session report and settlement | Pass |
| Admin report correction | Pass |
| Student and admin report PDF export | Pass |
| Booking create, tutor accept, Meet creation | Pass |
| Booking cancellation more than 24 hours before start | Pass |
| Booking decline and Marks release | Pass |
| Tutor payout lifecycle | Pass |
| Knowledge Bank list and PDF access | Pass |
| Knowledge Bank grant create, edit, remove | Pass |
| FAQ authoring and app display | Pass |
| Achievement submit, moderate, approve, app display | Pass |
| Activity draft authoring | Pass |
| Blog category and draft authoring | Pass |
| Blog publish | Pass after CSP fix and alt-text correction |
| Calendar authoring and public display | Pass — admin-created event visible |
| Knowledge Bank authoring | Pass — PDF upload, save, public display, PDF fetch |
| Marketing home EN and ID | Pass |
| Marketing achievements page | Pass |
| Marketing events/activities page | Pass |
| Marketing contact page | Pass |
| Marketing FAQ page | Pass — FAQ visible |
| Marketing tutors page | Pass — Diego visible |
| Marketing blog index | Pass — ID article listed; EN not published |
| Marketing blog article detail | Pass — `/id/blog/uat-production-blog-draft` renders |
| Marketing blog images | Pass — optimizer 200, image renders |
| Bilingual blog: English publish + marketing page | Pass |
| Friend referral attribution (`UAT506`) | Pass |
| Google OAuth entry/callback URL | Pass at provider entry; full consent not completed |
| 200% zoom reflow (11 app pages) | Pass — no horizontal overflow |
| Accessibility tree, labels, focus order, dialog semantics | Pass — no unnamed controls; actual screen-reader speech not tested |
| Email OTP signup, welcome mail, password login | Pass |
| Forgot-password email, reset link, new-password login | Pass |
| KOL campaign create, pause, resume | Pass |
| KOL code attribution at signup | Pass |
| KOL commission, settlement, transfer | Not executed — requires real paid purchase and bank transfer |
| Browser-clock date checks | Pass for client-rendered UI; server dates unchanged |
| Live payment checkout | Not executed — provider test mode is off |

## Defects

### D1 — Resolved: payout finance reads returned HTTP 500

First run failed with 500 on `tutor/getMyPayoutFinance`, `admin/getTutorPayoutReport`, and `admin/getPendingTutorPayouts`. Retest passed with 200 responses, and the full payout lifecycle completed.

### D2 — Resolved: Cloudflare Insights CSP

Retest: the app CSP now includes `https://static.cloudflareinsights.com` in `script-src`. No CSP error appeared in the console. Only PostHog client rate-limit messages remain, which are analytics noise.

### D3 — Resolved: app FAQ content missing

Created and published "What is Cogito Academy?" in the app admin. Student `/faq` displayed the category, question, and answer.

### D4 — Resolved: tutor list-page latency

Retest with a fresh navigation: `/dashboard` 609 ms, `/my-classes` 587 ms, `/bookings` 617 ms to visible content. The previous 5–10 second spinner did not reproduce.

### D5 — Resolved: blog image upload and publish now work

First attempt failed with `The source image cannot be decoded`. Root cause was the app CSP `img-src 'self' data: https:` blocking the editor's `blob:` preview URL. The deployed web CSP now includes `blob:`.

Retest:
- Hero image upload returned `Image uploaded`.
- Required fields reached 9/9.
- Publishing returned no decode error.

Remaining UX issue: an inline body image was accepted without alt text, then publish failed with a generic `Article could not be published` message. The API detail was `body[1].alt Too small`. The editor should require alt text at upload time or show the field-level error. Removing the image allowed publishing.

Published article: `https://www.cogitoacademy.id/id/blog/uat-production-blog-draft` renders correctly with title, introduction, key facts, body, and publish date.

### D6 — Resolved: KB private bucket configured and authoring works

The cutover is active in production:

```
CONTENT_ADMIN_ENABLED=true
KB_SOURCE=database
CC_SOURCE=database
KB_PRIVATE_BUCKET=cogito-private-kb
API version 604ba70c
```

Retest after the private bucket fix:
- Admin opened `/knowledge-bank` → **Manage resources** → **Add resource**.
- PDF upload returned `PDF ready: student-reports-2026-11-02.pdf`.
- Save returned `Changes saved live`; the resource appeared with status Active, version 1.
- Public list showed "UAT Production KB Resource 2026-11-03".
- Student login also showed the same resource.
- PDF endpoint returned 200, `application/pdf`, 36,313 bytes, header `%PDF-`:
  `/content/knowledge-bank/1ab4284b-b763-4ac0-8af9-0fda6eff606e/file`

Calendar authoring also works: admin created "UAT Production Calendar Event" for 30 November 2026 through the app UI, and it appeared in the public calendar.

Remaining content note: the cutover was applied before the Sanity import, so the previously seeded KB/calendar data is not in the database. Create entries through the admin or run the import/seed to restore the full catalog.

### D7 — Resolved: marketing tutors page

Retest: `/en/tutors` and `/id/tutors` load with `Age: 0` and show Diego by Cogito with teaching format, competition fields, and subjects. The previous "temporarily unavailable" page is gone.

### D8 — Resolved: marketing FAQ page

Retest: `/en/faq` and `/id/faq` load with `Age: 0` and display "About Cogito Academy — What is Cogito Academy?". The previous placeholder is gone.

### D9 — Resolved: marketing blog index

Retest: `/id/blog` lists "UAT Production Blog Draft" under category UAT, with date and reading time. The detail page still renders. `/en/blog` remains empty because only the Indonesian version was published.

### D10 — Resolved: marketing blog images

After `NEXT_PUBLIC_R2_HOST` was added to the marketing build:

```
GET /_next/image?url=...r2bucket...webp&w=640&q=75
200 image/jpeg, 8,561 bytes
```

The blog index image rendered at 414×217. No console errors. The previous `INVALID_IMAGE_OPTIMIZE_REQUEST` no longer occurs.

## App flow evidence

### FAQ
- Admin created, published, and listed one active FAQ on the app landing page.
- Student saw the category, question, and expanded answer.

### Achievements
- Student submitted "UAT Production Achievement", National level, 1 November 2026, with a proof link.
- Admin reviewed and approved it.
- Student list changed from Pending 1 to Approved 1.

### Knowledge Bank grants
- Admin created a grant for Andre expiring 2 December 2026, edited its note, then removed it.
- Public Knowledge Bank PDF returned 200, `application/pdf`, 832,019 bytes, header `%PDF-`.

### Class lifecycle
- Masterclass `332d79a4-bc9d-4672-b25c-28ed9924cebe` published; Meet link created.
- Student held 5 Marks; tutor report deducted 5 Marks and created a Rp400,000 fee.
- Admin correction produced report version 3 without repeat settlement.
- Student and admin PDF export produced a valid PDF, 36,313 bytes.

### Cohort and enrollment plans
- Cohort `d0f39a56-8ba4-4efe-abaf-3ec93c691496` published with four sessions and four Meet links.
- Andre full enrollment: 80 Marks held.
- Argya half enrollment: 44 + 44 Marks funded.
- Athena single enrollment: 25 Marks held.
- Cancellation inside 24 hours was rejected with the policy message and no Marks change.
- Later single cancellation: fee 5 Marks, return 20 Marks.
- Half-plan withdrawal: fee 13 Marks, return 53 Marks, retained 22 Marks.
- Late absence on session 1 and early absence on session 2 were recorded correctly.

### Booking lifecycle
- Student requested 38-Mark sessions; tutor accepted one and a Meet link was created.
- Cancellation more than 24 hours before start returned 38 Marks.
- Tutor declined a second request with a reason; all 38 Marks returned.

### Tutor payout
- Synthetic bank and tax profile saved: BCA `0000000001`, legal name "Diego UAT Review", NIK `0000000000000001`.
- Prepared payout: gross Rp400,000, tax Rp12,000, net Rp388,000.
- Recorded synthetic transfer `UAT-PROD-NO-REAL-TRANSFER`.
- Void after transfer required reconciliation; reconciliation returned the source to Unpaid.
- Prepare then void before transfer: reconciliation not required; source returned to Unpaid.

### Content authoring
- Activity draft "UAT Production Activity" saved.
- Blog category "Kategori UAT" created.
- Blog draft "UAT Production Blog Draft" saved with Indonesian title, introduction, body, SEO fields, cover description, key facts, and category. Publish blocked by D5.

## Marketing site evidence

| Page | Result |
| --- | --- |
| `/en` | Pass: English home, hero, programs, sections render |
| `/id` | Pass: Indonesian home renders localized copy |
| `/en/achievements` | Pass: shows approved "UAT Production Achievement", National, 2026, Andre by Cogito |
| `/en/activities` and `/id/activities` | Pass: show "UAT cohort session 1" under "UAT Production Cohort 2026-11-03" |
| `/en/contact` | Pass: contact page renders |
| `/en/faq` | Stale placeholder; API has the FAQ (D8) |
| `/en/tutors` | Stale error page; API has the tutor (D7) |
| `/en/blog` | Empty; no published article (D9) |

No console errors were observed on marketing pages; the only warnings were an unused CSS preload.

## Time manipulation results

Playwright `page.clock` was installed in the browser and fixed to different timestamps.

| Fake time | Check | Result |
| --- | --- | --- |
| 05:00 WIB | Student dashboard greeting | "Good morning, Andre. ready to learn?" |
| 11:00 WIB | Student dashboard greeting | "Hello, Andre! What's next on the learning list?" |
| 15:00 WIB | Student dashboard greeting | "Good afternoon, Andre. finish strong" |
| 18:00 WIB | Student dashboard greeting | "End the day a little wiser, Andre" |
| 15 Dec 2026 | Competition calendar | Rendered December 2026 grid |
| 15 Jan 2027 | Competition calendar | Rendered January 2027 grid with January events |

Limits:
- Booking availability did not shift under a fake browser clock. Slots still came from the server's real "next seven days". Server time is authoritative.
- Session cookies showed an expired banner when the browser clock moved far forward, because expiry is evaluated against the fake clock.
- Report eligibility, payout deadlines, and similar server-settled states cannot be time-travelled with client JavaScript. Those require database or server-clock control.

### Email OTP signup

Fresh inbox `uatotp1103a@yopmail.com` used end to end:

1. Opened `/login` → Sign up.
2. Entered name, KOL code `UATKOL1103`, email, and password.
3. Clicked Send code; UI showed "Code sent... expires in 5 minutes".
4. Yopmail inbox received "Verify your Cogito Academy email" with code `178715`.
5. Entered the code; account was created and landed on `/dashboard` with 15 welcome Marks.
6. Yopmail received the separate "Welcome to Cogito Academy" email with the login link.
7. Signed out and signed back in with email + password; landed on `/dashboard` again.
8. Forgot-password flow: requested a reset from `/forgot-password`; Yopmail received "Reset your Cogito Academy password" with a valid link.
9. Reset link opened `/reset-password?token=...`; new password saved and login succeeded with the new password.

### Bilingual blog publish

- English tab completed to 9/9 required fields.
- `Save all languages` then `Publish English` succeeded; status became Published.
- Marketing `/en/blog` listed the article and `/en/blog/uat-production-blog-draft` rendered the English body.
- EN image uses the same `NEXT_PUBLIC_R2_HOST` path; optimizer is already verified.

### Friend referral signup

- Fresh account `uatfriend1103b@yopmail.com` signed up with Andre's friend code `UAT506`.
- OTP received and accepted; account landed on `/dashboard` with 15 welcome Marks.
- Admin Activity shows "UAT Friend Student", source `UAT506`, outcome "Awaiting paid completion", welcome credit 15 Marks.

### 200% zoom and assistive-technology semantics

Method: Edge headless with a 720 CSS px viewport at device scale factor 2, equivalent to 200% browser zoom reflow. Tested login, student dashboard/classes/bookings/Knowledge Bank/calendar/profile, and admin dashboard/referrals/payouts/classes.

Zoom/reflow:
- `document.scrollWidth` stayed 720 on every page; no horizontal page overflow.
- Only expected off-canvas sidebar elements sat outside the viewport; opening the sidebar is available.
- Screenshots: `tmp/uat-prod/zoom-*.png`.

Accessibility semantics:
- One `h1` and a `main` landmark on every tested page.
- Zero visible interactive controls with an empty accessible name.
- Every visible input/textarea has a label, `aria-label`, or `aria-labelledby`.
- Every image has an `alt` attribute.
- No duplicate IDs.
- Keyboard order starts with "Skip to main content"; each subsequent control had a visible focus ring or shadow.
- Knowledge Bank viewer is a labelled dialog (`aria-labelledby`) and closes with Escape.

Limitation: this validates the accessibility tree and keyboard order, not actual speech output from NVDA/JAWS/VoiceOver.

### Google OAuth entry

Clicking "Sign in with Google" reached `accounts.google.com` with:

- Correct client ID.
- `redirect_uri=https://api.cogitoacademy.id/api/auth/callback/google`
- Signed state present.
- `prompt=consent`.
- Scopes `email profile openid`.

Full Google consent/callback was not completed because it needs a real Google account session.

### KOL non-payment flows

- Admin created campaign `UAT KOL Campaign 2026-11-03`, code `UATKOL1103`, expiry 30 Nov 2026, 30-day attribution, Rp50,000 + 5%.
- Campaign appeared Active.
- Pause required a reason, changed the action to Resume, and kept existing attribution windows.
- Resume restored Active status.
- New signup with code `UATKOL1103` was recorded in admin Activity as source `UATKOL1103`, outcome "Awaiting eligible top-up", with 15 welcome Marks.
- Commissions tab loaded and showed "No KOL commission decisions yet", correct before any paid purchase.
- Monthly CSV export downloaded `kol-reconciliation-2026-11.csv` with the expected header and no decision rows.

Commission calculation, settlement, and transfer remain untested because they require a real paid purchase and a real bank transfer.

## Production fixtures created

- Masterclass `332d79a4-bc9d-4672-b25c-28ed9924cebe` and report `59e4e8ee-...` version 3.
- Cohort `d0f39a56-8ba4-4efe-abaf-3ec93c691496`, four sessions.
- Enrollments: Andre full, Argya half (withdrawn), Athena single active and Athena single cancelled.
- Bookings: `ab40436e-...` cancelled, `075d7d1d-...` declined.
- Absence notices on cohort sessions 1 and 2.
- Payout records: unpaid, voided before transfer, voided after synthetic transfer with reconciliation.
- FAQ entry, approved achievement, activity draft, blog category and draft.
- Tutor availability 3 November 2026 to 25 January 2027.
- OTP account `uatotp1103a@yopmail.com`, 15 Marks, attributed to KOL code `UATKOL1103`; password reset verified.
- Friend-referral account `uatfriend1103b@yopmail.com`, 15 Marks, attributed to code `UAT506`.
- Blog article `UAT Production Blog Draft` now published in Indonesian and English.
- KOL campaign "UAT KOL Campaign 2026-11-03", code `UATKOL1103`, Rp50,000 + 5%, active.
- KB resource `UAT Production KB Resource 2026-11-03` and calendar event `UAT Production Calendar Event`.
- Wallets: Andre 115 / 80 / 195; Argya 165 / 22 / 187; Athena 170 / 25 / 195.
- Evidence: `tmp/uat-prod/` and `.playwright-mcp/student-reports-2026-11-02.pdf`.

## Not tested

- Live Midtrans checkout, webhook, refund, and live-mode switch. `payment/getConfig` returned `testMode: false`.
- Full Google OAuth consent and callback. The provider entry URL, client ID, redirect URI, state, `prompt=consent`, and scopes were verified.
- KOL commission/settlement in production. These were covered locally on 24 October 2026 (21 PostgreSQL cases, 5 policy/CSV units, 7 synthetic browser cases; 26 tests / 227 assertions), but production browser/DB E2E and a real bank transfer were not executed.
- Restoring the full KB/calendar catalog from Sanity or the #345 seed.
- Actual screen-reader speech output (NVDA/JAWS/VoiceOver). The accessibility tree, names, labels, focus order, and dialog semantics were verified.
- Server-side time travel for report eligibility, payout deadlines, or cron behavior.
