# Release v3 - consolidated decision register

Date: 19 October 2026. Status: **commercial scope, fee and target window locked for quotation R1; product/operational decision register remains open**. Nothing in the proposed answers below has been approved merely by being written here. No client message has been sent.

This register supplements the 18 October Post-Meeting Scope. It does not reopen the agreed Midtrans/Marks-only payment boundary, prices, Activities structure, public tutor eligibility, report layout or FAQ management. Questions concern cases that affect money, seats or delivery acceptance. Material requests are listed separately.

## Confirmed in this chat

**COMMERCIAL-01 — locked by project owner, 19 October 2026:** the additional
scope quotation is Rp5,500,000 as one fixed bundle, includes competition
catalog requirements REQ-COMP-01..07, and targets production release during W1
November (1-7 November 2026). Recorded in quotation
COGITO-V3-ADD-20261019-R1 and PRD source S06. This is the owner's commercial
baseline for client acceptance; it does not record client acceptance, payment,
UAT approval or a fixed launch commitment. Q01-Q12 and Q14-Q15 remain open and
continue to gate their dependent release behavior.

**COMP-02 — parent palette addition authorized by project owner, 18 October:**
parent subjects need four separate colors: light text/background and dark
text/background. Recorded as source S05 / REQ-COMP-07. Children inherit parent
appearance; canonical OKLCH validation, partial edit preservation and theme
previews are development design choices. Commercial inclusion and the target
window are recorded separately under COMMERCIAL-01; historical financial
agreements remain unchanged.

**COMP-01 — additional scope authorized by project owner, 18 October:** add
CRUD for both parent competition types and child specializations; record in PRD
first and adjust dependent scope and development order. PRD S04 /
REQ-COMP-01..07 and SPEC §2 contain the development design (parent-owned rates,
safe archive/delete, stable history and dynamic consumers). Basic CRUD scope
is confirmed; those detailed design rules are implementation choices, not a
claim of client acceptance. The project owner later included this complete PRD
scope in COMMERCIAL-01. Original source PDF remains the historical S01 scope.

**LANG-01 - resolved by project owner, 18 October:** all main-website content requires English; Indonesian is optional. Admin content forms offer both English and Indonesian inputs. The application interface is entirely English. Optional Indonesian website content is not an app-interface translation requirement. Proposed implementation: Indonesian pages fall back to English per missing field; app class/content screens render English.

**T10 tutor website projection - resolved by project owner, 19 October:** use
the current app tutor/profile and subject-category structure already agreed with
the client. Replace the website's city filters with Online/Offline teaching
format filters; profiles marked `both` match either filter. Keep the app's
current fixed modality values for this release; no modality CRUD or new city
field is added. Reconcile the intended website roster with published app
profiles before release, because the website read does not import or fall back
to Sanity tutor records.

## Product/finance decisions

**Q13 — resolved by project owner, 18 October 2026 (direct chat):**
"Setuju kedua pilihan + tier mengikuti paket." Custom top-up remains selectable
alongside the recommended better-value package. Tier boundaries follow configured
package Marks; applicable package unit price plus configured surcharge determines
custom cost. Exact package Marks use package prices. Recommend the next larger
package at equality as well. This approval does not resolve any other Q ID.

| ID / status | Question to confirm | Proposed answer for confirmation | Why the answer changes development |
| --- | --- | --- | --- |
| Q01 / OPEN | Does a half-plan enrollment reserve the student's place in **all remaining sessions**, including the unpaid half, until its payment deadline? May single-session buyers take those unpaid-half seats before that deadline? | Reserve the half-plan student's place in all selected remaining sessions until the second half starts. Sell single-session seats only from remaining capacity. On non-payment, release all future unpaid-half reservations. | Otherwise a student paying the second half on time could find it sold out. Capacity must be checked per session, including pending checkout reservations. |
| Q02 / OPEN | For someone joining late, is the half split based on their remaining sessions or the original cohort halves? Are full/half per-session rates locked for the whole enrollment, including the later half and rejoining after non-payment? Can a student switch payment plan after joining? | Split that student's remaining sessions into ceil(R/2) and floor(R/2); lock those session IDs and both installment rates at enrollment. Rejoin after removal is a new quote at the current half rate, future sessions only. No self-service plan switching in this release. | Determines due dates/reminders and pricing after admin changes. Original fixed halves could require immediate payment of a second half for a late joiner. |
| Q03 / OPEN | If all students cancel a particular cohort/masterclass session more than 24 hours ahead, is the flat tutor fee still payable? If everyone is absent/late-cancels, does a tutor who delivers the scheduled session earn the full flat fee? | Zero chargeable seats before the deadline: admin cancels the session, no fee. Chargeable no-shows/late cancellations: tutor earns the flat session fee only after delivery is confirmed and the report is submitted. Individual early seat cancellation never proportionally reduces a fee for a session that still runs. | The cancellation table says "no fee" for a seat, while cohort/masterclass fees are flat per session. Both cannot be applied proportionally without clarification. |
| Q04 / OPEN | For cohort minimum enrollment checks, do single-session buyers count? After a postponement, does the three-day penalty-free exit apply only once, and what happens if the replacement date is sooner than three days away? Does a normal later schedule change also grant that exit? | Count unique active full/half-plan students, excluding single seats and expired checkouts. One cohort postponement grants a 72-hour exit window; replacement start must be after that window. Other session reschedules follow the agreed technical-failure/tutor-absence rule and need explicit treatment if a student cannot attend. | Revenue/capacity thresholds and penalty-free releases depend on this definition. Avoid imposing a new date before the promised exit window expires. |
| Q05 / OPEN | Are cohorts/masterclasses online-only for launch, or also in-person? Who sets session duration/venue, and are the flat fees Rp400,000/Rp300,000 the same for both modes? | Support online first; admin explicitly sets start/end, no assumption that the on-demand 90-minute default applies. Add in-person only if required, with venue and fee policy confirmed before implementation. | Scope mentions online/in-person report metadata and Meet on publish but does not fully define big-class venue/fee rules. Online-only is a proposal, not a scope reduction already agreed. |
| Q06 / OPEN | Should a student who cancelled a seat early, withdrew before a session, or was removed for non-payment see that session's report/PDF? Does an absent but still chargeable student keep report access, and can that no-show trigger a friend reward? | Reports belong to students with a chargeable entitlement for the delivered session, including no-shows; no access for early-cancelled/released/unpaid seats. Do not generate a report for an undelivered session. Reward requires the student's completed chargeable session; an administrative no-show/penalty alone does not qualify. | "Held a seat" and "first completed class" are insufficient to resolve cancelled seat histories. Also protect cohort content access and prevent cancellation fees from triggering rewards. |
| Q07 / OPEN | How should existing tutors without NIK be handled at launch: continued booking/teaching, blocked payout, or payout under the configured Missing tax rate? Must old long reports be included in the new PDF export? | Existing published tutors may continue teaching. Require tax-profile completion before new payout preparation; keep legacy paid records unchanged. Preserve old reports fully; if a legacy report exceeds a page, use a clearly labelled legacy continuation page rather than truncate. | Missing default tax status suggests legacy cases, but required NIK implies gating. Historic reports can exceed the new 600-character field limit and cannot satisfy lossless one-page output automatically. These two legacy policies need explicit acceptance. |
| Q08 / OPEN | If actual tutor transfer differs from calculated net, can the admin mark the payout paid? Can one payout cover selected sessions, and how is a void handled when money was actually transferred? | One batch may cover selected unpaid session fees. Require actual amount = calculated net to mark fully paid; correct calculation/batch with an audited action if necessary. A real external transfer cannot be erased by void: keep its history and flag reconciliation before re-payment. No partial tutor-payout workflow unless separately agreed. | KOL partial/overpayments are defined, tutor payouts are not. Void releasing sessions can cause a second external payment if the first transfer really occurred. |
| Q09 / OPEN | Does a KOL signup code also grant the 15-Mark welcome bonus? Can a new user apply both a friend and a KOL code, and may tutors/admins use referral rewards? | One registration code only, either friend or KOL. Welcome applies to either valid type; friend reward only for friend attribution, KOL commission only for KOL attribution. Only student accounts participate as referred users/referrers. | Scope says "valid-code welcome" but separates friend and KOL programs; roles and stacking are not explicit. Proposed KOL welcome and role restriction require confirmation. |
| Q10 / OPEN | If a referrer has no semester cap left at the referred student's first completed paid class, is that reward permanently exhausted, or can a later completion/semester earn it? | Evaluate once at the first eligible completion. Credit up to remaining cap; record the event even when reward is zero. No rollover or retry in a later semester. Cap reductions do not claw back prior rewards. | Otherwise "first class" could accidentally become repeated reward attempts or create a future financial liability. |
| Q11 / OPEN | Is KOL percentage calculated on the package/exact-top-up price excluding gateway fees? What is the commission rounding rule, and is the 90-day eligibility measured by successful payment time or checkout creation time? | Base = the server-snapshotted IDR purchase price, excluding gateway/channel fees; commission = round(flat + base*percentage/100) to whole rupiah. Payment success must occur before the attribution expiry, based on authoritative provider success time; retries/duplicate events count once. | Existing payments may include channel fees in provider gross. A late callback or checkout opened on day 89 must not make the financial rule accidental. |
| Q12 / OPEN | What anchors KOL code validity (30 days), and may admin corrections move commission to another campaign after signup/payment? What if the first successful top-up is later reversed? | Validity runs from campaign activation to explicit expiry. Registration choice is immutable for the student; admin can correct a mistake with reason/history but cannot rewrite an already settled transfer. Reversal voids that qualifying commission; it does not make a later top-up a second "first" event without an explicit admin resolution. | Attribution start, eligibility and correction scope alter commission liabilities. Existing scope authorizes correction but does not define these boundaries. |
| Q13 / RESOLVED | When a better-value package is offered for an exact amount, is the smaller custom purchase unavailable or still selectable? When package Marks/prices are edited, do exact-top-up tier thresholds change with them? | Require an explicit student choice: recommended package versus original custom quote, unless product wants to prohibit poorer value. Derive tiers from the active package Marks and unit rates plus surcharge; validate strictly ascending Marks/decreasing unit rates and show preview before save. | "Offer instead" can mean recommend or replace. Editable packages need a policy beyond hardcoded 150/250/500 boundaries. At equality, suggestion still applies. |
| Q14 / OPEN | If branding/FAQ/video inputs arrive late, may the app and core website launch while the feature showcase is deferred? Who performs client UAT and signs off by which checkpoint? | Confirm one named approver and backup; sign off finance/enrollment/auth/content independently. A late video may be explicitly deferred while core launches, but never silently omitted. No launch before financial/access acceptance. | PDF allows affected deliverable or launch date to shift but does not give authority to split the release or identify an acceptance owner. |
| Q15 / OPEN | What should admin booking-value analytics mean: initial request, current confirmed participants and remaining sessions, or delivered sessions? For group-series, should the amount cover the proposer or every confirmed participant, and should the date range use booking creation or session delivery dates? Should V3 Marks be converted to IDR or shown separately? | Proposed safe interim view: show booking counts by saved pricing engine only. Keep cash revenue tied to successful top-up payments minus refunds; do not infer V3 IDR value or platform take. Reintroduce booked-service totals only after the population, participant, session, and date basis is chosen and legacy coverage is validated. | `originalMarks` is a pooled amount for one-time groups, a full package for solo series, and the proposer's package for group-series. Parent snapshots are per-session; V3 has no total service IDR/platform-take fields. `booking.createdAt` currently filters the period. Summing these as one booked-value total mixes units and populations. |

Questions Q07, Q08, and Q15 may be answered by the finance/operations owner rather than the general client contact. Q05 online-only remains a proposal requiring acceptance. Q13 is resolved by the project owner as recorded above.

## Materials and operational follow-ups

| ID / status | Request | Needed for |
| --- | --- | --- |
| M01 / WAITING | Original report header/banner/logo or editable file; approved initial FAQ English text (optional Indonesian), initial class covers/curriculum/titles and Other activities to retain. Identify content approver and delivery date. | Production-quality PDF and populated website/classes. Empty tutor list is already acceptable; no placeholder identities. Existing FAQ wording can be imported only after approval. |
| M02 / WAITING | Feature-showcase ownership, one video vs several clips, featured app flows, script approval, duration/aspect ratios, source captures/brand assets, revision/approval owner and delivery date. | A bounded production brief. Developer production remains provisional; references do not define quantity/effort. Choose licensing/music/voiceover only if requested in that brief. |
| OPS01 / FOLLOW-UP | Cogito confirms configured tax defaults with its adviser and supplies reviewed Marks-only wording. | Operational approval; this register gives no independent tax/legal advice and does not change payment scope. |

## Decisions delegated to development

Do not send these as extra client questions unless an implementation would change the agreed UX or financial outcome:

- Asia/Jakarta for display/calendar semester boundaries; store instants in UTC; deadline comparison on the server. Document exact inclusivity in SPEC.
- Server-side integer money/Marks math, atomic allocation, unique event constraints and authorization; details of lock/outbox/job retry design.
- Indonesian per-field fallback to required English; both fields remain visible in admin, all app chrome/validation/email defaults English. Flag if the proposed fallback is not desired.
- Safe FAQ formatting, active filtering, rate limits, pagination, cache invalidation, observability and CSV formula-injection protection.
- Repeated report-reminder cadence, reasonable carousel timing and reduced-motion behavior, selected section spacing.
- Admin audit must preserve before/after, actor/time/reason; no secret/PII logging.
- Separate legacy on-demand policies from new big-class rules unless a requirement explicitly changes both; three-field reports and English app rules do apply across types.

## How to close this register

Record actual answer, decision owner, date, source and any replacement text under each ID. Update PRD/SPEC/acceptance tests together. OPEN remains OPEN if no reply arrives. A proposed answer does not become approved through elapsed time. Implementation may proceed on independent confirmed requirements; dependent financial/seat branches remain gated as listed in TASKS.
