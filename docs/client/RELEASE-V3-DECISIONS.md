# Release v3 - consolidated decision register

Initial register: 20 October 2026. Last consolidated: 30 October 2026. Status: **commercial scope and owner-approved policies recorded; product/operational register remains partially open**. Q01-Q13 are resolved by the project owner; Q14 remains open; Q15 was resolved by owner delegation on 30 October 2026. Proposed answers below are not approved merely by being written here; decisions explicitly marked RESOLVED record direct project-owner approval. No client message has been sent.

This register supplements the 18 October Post-Meeting Scope. It does not reopen the agreed Midtrans/Marks-only payment boundary, prices, Activities structure, public tutor eligibility, report layout or FAQ management. Questions concern cases that affect money, seats or delivery acceptance. Material requests are listed separately.

## Cara memakai register ini

File ini adalah satu register keputusan selama development V3 dan bahan pembahasan dengan client. Tambahkan keputusan, pertanyaan, proposal dan perubahan status di sini; jangan membuat satu file terpisah untuk tiap keputusan. PRD, API docs dan readiness tracker tetap merujuk ke register ini untuk dasar keputusan.

Bedakan **CONFIRMED BY PROJECT OWNER**, **PROPOSED / menunggu persetujuan**, dan **OPEN**. Persetujuan owner lewat chat tidak otomatis berarti client sudah menerima secara tertulis. Catat tanggal, sumber persetujuan, dampak dan pertanyaan yang tersisa; hasil tes bukan persetujuan kebijakan.

## Owner follow-up — 30 Oktober 2026

- **CONTENT/VIDEO — CANCELLED BY PROJECT OWNER (chat: “konten/video ga ada. gajadi itu”):** pengadaan konten/video tidak jadi deliverable. M01 permintaan materi dan M02 feature-showcase/video tidak lagi menjadi gate delivery pada scope ini. Ini tidak menghapus fitur pengelolaan konten/FAQ/kelas yang sudah disepakati; halaman tanpa data memakai empty state. Tidak menunggu aset/content/video dari client untuk menutup pekerjaan development ini.
- **Q04 — RESOLVED BY PROJECT OWNER (30 Oktober 2026):** perubahan jadwal biasa memberi hak keluar hanya untuk sesi yang berubah dan belum delivered. Batasnya yang lebih awal antara notifikasi +24 jam dan waktu mulai sesi baru; konfirmasi harus sebelum batas. Marks yang tersisa pada sesi terdampak dikembalikan, bukan cash. Hak tampil kontekstual, jelas, dan accessible. Pergantian tutor pada tanggal/jam yang sama tidak memberi hak keluar baru. Minimum-enrollment postponement 72 jam tetap aturan terpisah.
- **Q15 — RESOLVED BY OWNER DELEGATION, 30 Oktober 2026:** owner menyerahkan pemilihan definisi business insights kepada developer/assistant. Definisi final ada di bagian Q15: penerimaan top-up IDR, layanan delivered Marks, future commitments, dan biaya tutor earned dipisahkan; tidak ada konversi booking Marks ke IDR atau klaim laba.

## Ringkasan keputusan development — 30 Oktober 2026

| ID            | Status / sumber                                                 | Keputusan dan dampak                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEV-01        | CONFIRMED BY PROJECT OWNER — chat development                   | App belum diluncurkan; implementasi V3 langsung. Hapus jalur/UI kompatibilitas pre-V3 yang superseded, tanpa mempertahankannya demi data/pengguna hipotetis. Preserve perubahan workspace yang tidak terkait.                                                                                                                                                                                    |
| DEV-02        | CONFIRMED BY PROJECT OWNER — chat development                   | Tujuh competition default, specialization termasuk Law Debate, Marks packages dan default economy configuration ditempatkan di seed; migration tidak menambahkan default catalog/business data tersebut.                                                                                                                                                                                         |
| DEV-03        | CONFIRMED BY PROJECT OWNER — 30 Oktober, “oh iya per kelas aja” | Fee cohort/masterclass dapat diedit admin per kelas. Nilai awal Rp400.000/Rp300.000 per sesi; seluruh sesi memakai flat fee kelas yang disepakati. Ini bukan batas publish atau setting global-only. Fee yang sudah earned tidak ditulis ulang.                                                                                                                                                  |
| DEV-04        | CONFIRMED BY PROJECT OWNER — 30 Oktober, instruksi testing      | Live Google Meet acceptance memakai provider sungguhan dan wajib cleanup event tes agar tidak menumpuk. Unit/synthetic/race tests tetap boleh memakai controlled providers; hasilnya dibedakan dari bukti live integration.                                                                                                                                                                      |
| DEV-05        | AUTHORIZATION DEVELOPMENT — 30 Oktober                          | Acceptance boleh berjalan di dev localhost:6767/cogito-app; reset/reseed dev diizinkan bila diperlukan. Verifikasi target terlebih dahulu dan pilih fixture/cleanup terarah bila reset tidak diperlukan. Start fresh dedicated 6769 dilakukan kemudian. Ini izin testing, bukan kebijakan client.                                                                                                |
| Q04 follow-up | RESOLVED BY PROJECT OWNER — 30 Oktober 2026                      | Perubahan jadwal biasa memberi hak keluar sampai min(notifikasi +24 jam, sesi baru mulai), hanya untuk sesi berubah yang belum delivered, dengan pengembalian Marks. Ganti tutor tanpa perubahan waktu tidak memberi hak keluar baru. Minimum-enrollment postponement 72 jam tetap terpisah. |

## Confirmed in this chat

**PAYOUT-AUDIT-01 — confirmed by project owner, 19 October 2026 (direct chat):**
manual tutor payout records should retain session-level detail so a later audit
can identify which sessions each transfer covered. Q08 separately resolves
batch, mismatch and void behavior; neither decision authorizes backfilling
historical aggregate payout rows.

**COMMERCIAL-01 — locked by project owner, 19 October 2026:** the additional
scope quotation is Rp5,500,000 as one fixed bundle, includes competition
catalog requirements REQ-COMP-01..07, and targets production release during W1
November (1-7 November 2026). Recorded in quotation
COGITO-V3-ADD-20261019-R1 and PRD source S06. This is the owner's commercial
baseline for client acceptance; it does not record client acceptance, payment,
UAT approval or a fixed launch commitment. Q14 remains open; Q15 was resolved by owner delegation on 30 October 2026. Q04 is
partially resolved; the other product decisions are recorded below.

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

**Q01 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. A half-plan enrollment reserves all selected remaining sessions, including the unpaid half, until its installment deadline. Single-session buyers may use only capacity left after those reservations. Non-payment releases all future unpaid-half reservations.

**Q02 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. Late joiners split their remaining sessions into ceil(R/2) and floor(R/2), with the selected session IDs and both installment rates locked at enrollment. Rejoining after removal is a new quote at the current half rate for future sessions only. No self-service plan switching is in scope.

**Q08 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. One payout batch may cover selected unpaid session fees; actual transfer must equal calculated net to mark fully paid. Corrections require an audited action. Partial tutor payouts are not supported. A void retains any actual external transfer and requires reconciliation before repayment.

**Q09 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. Registration accepts one friend or KOL code. The welcome reward applies to either valid code; friend reward and KOL commission apply only to their matching attribution. Only students participate as referred users or referrers.

**Q10 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. Evaluate a friend reward once at the first eligible completion, record the decision even when the credit is zero, credit only remaining semester cap, and do not roll over or retry in a later semester. Cap reductions do not claw back prior rewards.

**Q11 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. KOL commission uses the server-snapshotted IDR purchase price excluding gateway/channel fees and rounds to whole rupiah. Eligibility uses authoritative provider success time before attribution expiry; retries and duplicate events count once.

**Q12 — resolved by project owner, 20 October 2026 (direct chat, “Pakai usulan tersebut”):** the proposed answer is accepted unchanged. Campaign validity runs from activation to explicit expiry. Registration choice is immutable; corrections require reason/history and cannot rewrite settled transfers. A reversal voids the qualifying commission and does not automatically make a later top-up a new first event.

**Q03 — resolved by project owner, 19 October 2026 (direct chat):** zero
chargeable seats before the deadline means the admin cancels the session with
no tutor fee. Chargeable no-shows/late cancellations earn the full flat tutor
fee only after delivery is confirmed and the report is submitted. An early
individual cancellation never proportionally reduces the fee for a session
that still runs.

**Q06 — resolved by project owner, 19 October 2026 (direct chat):** students
with a chargeable entitlement may access the report for a delivered session,
including chargeable no-shows. Early-cancelled, released, or unpaid seats do
not receive access. Do not generate a report for an undelivered session. A
friend reward requires the student's completed chargeable session; an
administrative no-show/penalty alone does not qualify.

**Q07 — resolved by project owner, 19 October 2026 (direct chat):** existing
published tutors may continue teaching, but must complete the tax profile
before a new payout is prepared; legacy paid records remain unchanged. Preserve
legacy reports in full, using a clearly labelled continuation page when the
report exceeds one page rather than truncating it.

**Q04 — partially resolved by project owner, 19 October 2026:** minimum checks
count unique active full/half-plan students, excluding single-session buyers and
expired checkouts. One cohort postponement grants a 72-hour penalty-free exit;
the replacement start must be after that window. Rules for ordinary later
reschedules remain open.

**Q05 — resolved by project owner, 19 October 2026:** launch with both online
and in-person class sessions. In-person sessions use the existing
admin-managed room list. The client scope specifies a Meet per published online
session and reports that display online/in-person mode; it lists flat
per-session tutor fees of Rp400,000 per cohort session and Rp300,000 per
masterclass session without a mode-specific breakdown. The owner confirmed the
same flat fee applies to both modes.

**LEGACY-PAYOUT-02 — confirmed by project owner, 19 October 2026:** the V3 app
is not yet in use; the current fee-event contract is the source of truth for
new V3 completions, and no historical per-session backfill/reconciliation is
required for this release. Existing records may be discarded if they create a
risk, but no data was deleted and no production database was accessed. Any
cleanup remains scoped to an explicitly reviewed environment.

| ID / status                        | Question to confirm                                                                                                                                                                                                                                                                      | Proposed answer for confirmation                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why the answer changes development                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q01 / RESOLVED                     | Does a half-plan enrollment reserve the student's place in **all remaining sessions**, including the unpaid half, until its payment deadline? May single-session buyers take those unpaid-half seats before that deadline?                                                               | Reserve the half-plan student's place in all selected remaining sessions until the second half starts. Sell single-session seats only from remaining capacity. On non-payment, release all future unpaid-half reservations.                                                                                                                                                                                                                                                                               | Otherwise a student paying the second half on time could find it sold out. Capacity must be checked per session, including pending checkout reservations.                                              |
| Q02 / RESOLVED                     | For someone joining late, is the half split based on their remaining sessions or the original cohort halves? Are full/half per-session rates locked for the whole enrollment, including the later half and rejoining after non-payment? Can a student switch payment plan after joining? | Split that student's remaining sessions into ceil(R/2) and floor(R/2); lock those session IDs and both installment rates at enrollment. Rejoin after removal is a new quote at the current half rate, future sessions only. No self-service plan switching in this release.                                                                                                                                                                                                                               | Determines due dates/reminders and pricing after admin changes. Original fixed halves could require immediate payment of a second half for a late joiner.                                              |
| Q03 / RESOLVED                     | If all students cancel a particular cohort/masterclass session more than 24 hours ahead, is the flat tutor fee still payable? If everyone is absent/late-cancels, does a tutor who delivers the scheduled session earn the full flat fee?                                                | Zero chargeable seats before the deadline: admin cancels the session, no fee. Chargeable no-shows/late cancellations: tutor earns the flat session fee only after delivery is confirmed and the report is submitted. Individual early seat cancellation never proportionally reduces a fee for a session that still runs.                                                                                                                                                                                 | The cancellation table says "no fee" for a seat, while cohort/masterclass fees are flat per session. Both cannot be applied proportionally without clarification.                                      |
| Q04 / RESOLVED                     | For cohort minimum enrollment checks, do single-session buyers count? After postponement, does the three-day penalty-free exit remain separate from an ordinary schedule change? | Count unique active full/half-plan students, excluding single seats and expired checkouts. One cohort postponement grants a separate 72-hour exit. An ordinary schedule change grants an exit until min(notification +24 hours, new session start), only for the changed undelivered session as Marks. Same-time tutor replacement gives no new exit right. | Revenue/capacity and penalty-free release rules are specified separately. |
| Q05 / RESOLVED                     | Are cohorts/masterclasses online-only or also in-person, who sets the venue, and do the flat tutor fees differ by mode?                                                                                                                                                                  | Support both online and in-person. Admin selects the existing managed room and sets session start/end. Apply the same flat Rp400,000 cohort-session / Rp300,000 masterclass-session tutor fee to both modes.                                                                                                                                                                                                                                                                                              | S01 specifies Meet per published online session, online/in-person report metadata and flat per-session fees without mode-specific rates; the owner selected both modes, existing rooms and fee parity. |
| Q06 / RESOLVED                     | Should a student who cancelled a seat early, withdrew before a session, or was removed for non-payment see that session's report/PDF? Does an absent but still chargeable student keep report access, and can that no-show trigger a friend reward?                                      | Reports belong to students with a chargeable entitlement for the delivered session, including no-shows; no access for early-cancelled/released/unpaid seats. Do not generate a report for an undelivered session. Reward requires the student's completed chargeable session; an administrative no-show/penalty alone does not qualify.                                                                                                                                                                   | "Held a seat" and "first completed class" are insufficient to resolve cancelled seat histories. Also protect cohort content access and prevent cancellation fees from triggering rewards.              |
| Q07 / RESOLVED                     | How should existing tutors without NIK be handled at launch: continued booking/teaching, blocked payout, or payout under the configured Missing tax rate? Must old long reports be included in the new PDF export?                                                                       | Existing published tutors may continue teaching. Require tax-profile completion before new payout preparation; keep legacy paid records unchanged. Preserve old reports fully; if a legacy report exceeds a page, use a clearly labelled legacy continuation page rather than truncate.                                                                                                                                                                                                                   | This preserves teaching continuity and paid history while requiring a complete tax profile for new payouts and lossless legacy report export.                                                          |
| Q08 / RESOLVED                     | If actual tutor transfer differs from calculated net, can the admin mark the payout paid? Can one payout cover selected sessions, and how is a void handled when money was actually transferred?                                                                                         | One batch may cover selected unpaid session fees. Require actual amount = calculated net to mark fully paid; correct calculation/batch with an audited action if necessary. A real external transfer cannot be erased by void: keep its history and flag reconciliation before re-payment. No partial tutor-payout workflow unless separately agreed.                                                                                                                                                     | KOL partial/overpayments are handled separately; tutor payouts use the accepted all-or-nothing net check and history-preserving void reconciliation.                                                   |
| Q09 / RESOLVED                     | Does a KOL signup code also grant the 15-Mark welcome bonus? Can a new user apply both a friend and a KOL code, and may tutors/admins use referral rewards?                                                                                                                              | One registration code only, either friend or KOL. Welcome applies to either valid type; friend reward only for friend attribution, KOL commission only for KOL attribution. Only student accounts participate as referred users/referrers.                                                                                                                                                                                                                                                                | Scope separates friend and KOL programs; the accepted policy prevents stacking and limits referral participation to students.                                                                          |
| Q10 / RESOLVED                     | If a referrer has no semester cap left at the referred student's first completed paid class, is that reward permanently exhausted, or can a later completion/semester earn it?                                                                                                           | Evaluate once at the first eligible completion. Credit up to remaining cap; record the event even when reward is zero. No rollover or retry in a later semester. Cap reductions do not claw back prior rewards.                                                                                                                                                                                                                                                                                           | An explicit one-time zero-credit decision prevents repeated reward attempts or future cap liabilities.                                                                                                 |
| Q11 / RESOLVED                     | Is KOL percentage calculated on the package/exact-top-up price excluding gateway fees? What is the commission rounding rule, and is the 90-day eligibility measured by successful payment time or checkout creation time?                                                                | Base = the server-snapshotted IDR purchase price, excluding gateway/channel fees; commission = round(flat + base*percentage/100) to whole rupiah. Payment success must occur before the attribution expiry, based on authoritative provider success time; retries/duplicate events count once.                                                                                                                                                                                                            | Existing payments may include channel fees in provider gross. A late callback or checkout opened on day 89 must not make the financial rule accidental.                                                |
| Q12 / RESOLVED                     | What anchors KOL code validity (30 days), and may admin corrections move commission to another campaign after signup/payment? What if the first successful top-up is later reversed?                                                                                                     | Validity runs from campaign activation to explicit expiry. Registration choice is immutable for the student; admin can correct a mistake with reason/history but cannot rewrite an already settled transfer. Reversal voids that qualifying commission; it does not make a later top-up a second "first" event without an explicit admin resolution.                                                                                                                                                      | These boundaries define commission liability and preserve settled transfer history.                                                                                                                    |
| Q13 / RESOLVED                     | When a better-value package is offered for an exact amount, is the smaller custom purchase unavailable or still selectable? When package Marks/prices are edited, do exact-top-up tier thresholds change with them?                                                                      | Require an explicit student choice: recommended package versus original custom quote, unless product wants to prohibit poorer value. Derive tiers from the active package Marks and unit rates plus surcharge; validate strictly ascending Marks/decreasing unit rates and show preview before save.                                                                                                                                                                                                      | "Offer instead" can mean recommend or replace. Editable packages need a policy beyond hardcoded 150/250/500 boundaries. At equality, suggestion still applies.                                         |
| Q14 / OPEN                         | If branding/FAQ/video inputs arrive late, may the app and core website launch while the feature showcase is deferred? Who performs client UAT and signs off by which checkpoint?                                                                                                         | Confirm one named approver and backup; sign off finance/enrollment/auth/content independently. A late video may be explicitly deferred while core launches, but never silently omitted. No launch before financial/access acceptance.                                                                                                                                                                                                                                                                     | PDF allows affected deliverable or launch date to shift but does not give authority to split the release or identify an acceptance owner.                                                              |
| Q15 / RESOLVED BY OWNER DELEGATION | Business insights separates cash receipts (IDR), delivered service (Marks), future confirmed commitments (Marks/session counts), and earned tutor costs (IDR).                                                                                                                           | No Marks→IDR booking-value conversion or implied profit. Cash uses successful payment/refund event dates; delivery uses session delivery date; future commitments are an as-of-now snapshot. Sum per participant/session allocations, never mixed originalMarks parent fields. See detailed Q15 definition below.                                                                                                                                                                                         | Owner delegated choice in development chat on30October2026; this records product semantics, not implementation/acceptance completion.                                                                  |

Q15 is resolved by owner delegation; the detailed metric definition below is the implementation reference. Q04 ordinary schedule-change deadline is resolved as recorded below. Q01-Q13 are resolved as recorded above; Q14 remains open; Q15 was resolved by owner delegation on 30 October 2026.

## Materials and operational follow-ups

| ID / status                     | Request                                                                                                                                                                                                                           | Needed for                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 / CANCELLED BY OWNER 30 OCT | Original report header/banner/logo or editable file; approved initial FAQ English text (optional Indonesian), initial class covers/curriculum/titles and Other activities to retain. Identify content approver and delivery date. | Production-quality PDF and populated website/classes. Empty tutor list is already acceptable; no placeholder identities. Existing FAQ wording can be imported only after approval. |
| M02 / CANCELLED BY OWNER 30 OCT | Feature-showcase ownership, one video vs several clips, featured app flows, script approval, duration/aspect ratios, source captures/brand assets, revision/approval owner and delivery date.                                     | A bounded production brief. Developer production remains provisional; references do not define quantity/effort. Choose licensing/music/voiceover only if requested in that brief.  |
| OPS01 / FOLLOW-UP               | Cogito confirms configured tax defaults with its adviser and supplies reviewed Marks-only wording.                                                                                                                                | Operational approval; this register gives no independent tax/legal advice and does not change payment scope.                                                                       |

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

## Q04 follow-up — perubahan jadwal biasa dan tutor absen

Tanggal: 30 Oktober 2026; diperbarui setelah keputusan owner 30 Oktober 2026.
Status: **PARTIALLY RESOLVED BY PROJECT OWNER.** Usulan 72 jam dan cakupan sisa enrollment di bawah ini telah digantikan oleh keputusan 24 jam/sesi terdampak. Edge replacement-start timing remains open.
Referensi: RELEASE-V3-DECISIONS Q04; PRD REQ-CLASS-05.

### Keputusan yang diminta

Apakah siswa mendapat hak keluar tanpa penalti ketika Cogito mengubah jadwal kelas yang sudah dipublish, di luar postponement karena minimum peserta?

### Rekomendasi

**RESOLVED BY PROJECT OWNER — 30 Oktober 2026:** beri waktu 24 jam sejak notifikasi perubahan jadwal untuk membatalkan sesi yang jadwalnya berubah tanpa penalti. Refund berupa Marks untuk sesi terdampak; sesi yang sudah delivered tidak direfund. Durasi ini tidak mengganti minimum-enrollment postponement 72 jam.

| Pilihan                                                        | Dampak                                                                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Hak keluar 24 jam untuk sesi yang jadwalnya berubah (approved) | Refund sebagai Marks untuk sesi terdampak; sesi delivered tidak direfund.                                      |
| Hak keluar hanya untuk minimum-enrollment postponement         | Lebih sederhana mengikuti fitur yang ada, tetapi siswa dapat terkena penalti karena jadwal diubah oleh Cogito. |

### Batas aturan yang diusulkan untuk dikonfirmasi

1. Hak hanya berlaku pada perubahan tanggal/jam sesi yang dilakukan admin/Cogito setelah kelas dipublish; perubahan judul/deskripsi tidak memicu hak keluar.
2. Window 24 jam dihitung dari timestamp server notifikasi perubahan jadwal.
3. Refund hanya untuk sesi yang berubah, sebagai Marks; tidak mengembalikan cash dan tidak merefund sesi yang delivered.
4. **RESOLVED BY PROJECT OWNER — 30 Oktober 2026:** mengganti tutor tanpa mengubah tanggal/jam tidak membuka hak keluar.
5. **RESOLVED BY PROJECT OWNER — 30 Oktober 2026:** bila sesi pengganti mulai sebelum window 24 jam habis, hak keluar berakhir saat sesi pengganti mulai. Deadline = min(timestamp notifikasi + 24 jam, waktu mulai sesi pengganti). Pembatalan harus dikonfirmasi sebelum deadline; tidak berlaku setelah sesi mulai.
6. Setiap perubahan jadwal baru membuka jendela 24 jam baru hanya untuk sesi yang berubah. Minimum-enrollment postponement satu kali/72 jam tetap aturan lain.

### Keputusan lain terkait tutor absen

PRD meminta timestamp pemberitahuan absen dan penanda late jika pemberitahuan kurang dari 24 jam sebelum sesi.

**RESOLVED BY PROJECT OWNER — 30 Oktober 2026:** tutor boleh melaporkan absen setelah sesi dimulai selama sesi belum berstatus completed. Server timestamp menjadi waktu pemberitahuan dan pemberitahuan kurang dari 24 jam sebelum jadwal mulai, termasuk setelah mulai, dihitung late. Tidak ada cutoff pada jadwal selesai selama sesi belum completed. Penggantian tutor pada tanggal/jam yang sama tidak memberi hak keluar.

### Checklist persetujuan client

- [x] Owner mengonfirmasi hak keluar berakhir saat sesi pengganti mulai jika lebih awal daripada 24 jam sejak notifikasi.
- [ ] Catat nama approver, tanggal, dan perubahan yang diminta.

### Dampak implementasi

Tutor absence notice and admin same-time replacement are implemented with assignment-version history, audit, in-app notification, tutor conflict checks and stable Google event attendee updates. Same-time replacement leaves session schedule, flat fee and student allocations unchanged, and does not rewrite earned ownership. Ordinary schedule change exit duration and refund scope remain pending client confirmation; this implementation does not reschedule sessions or apply that policy.

## Q15 — definisi business insights yang dipilih

**RESOLVED BY OWNER DELEGATION — 30 Oktober 2026.** Sumber: owner menyerahkan pemilihan metrik kepada developer/assistant berdasarkan knowledge base produk. Definisi berikut menjadi acuan implementasi; bukan klaim dashboard sudah menyediakan seluruh metrik.

1. **Penerimaan top-up (IDR):** pembayaran provider yang berhasil, dikurangi refund uang yang benar-benar tercatat. Gunakan tanggal keberhasilan pembayaran dan tanggal refund masing-masing, bukan tanggal booking dibuat. Label sebagai penerimaan top-up; bukan laba atau pendapatan jasa yang sudah delivered. Gateway fee ditampilkan terpisah jika sumber faktanya tersedia; jangan diestimasi.
2. **Layanan terlaksana (Marks + jumlah sesi):** nilai layanan yang benar-benar delivered dan settled, dijumlah per peserta/per sesi dari snapshot/alokasi/ledger yang otoritatif. Gunakan tanggal delivery sesi. Pisahkan Marks penalti/no-show/cancellation dari layanan delivered agar tidak menggelembungkan utilisasi. Koreksi/refund mengikuti fakta pembalik yang tercatat, tanpa menghitung replay dua kali. Private dan Academy dapat ditampilkan terpisah agar satuan sesi dan seat-session jelas.
3. **Komitmen mendatang (Marks + sesi/seat-session):** snapshot saat ini untuk sesi mendatang yang confirmed beserta peserta aktifnya. Pisahkan funded/held Marks dari cicilan/reservasi yang belum funded; pending request dan checkout kedaluwarsa tidak menjadi confirmed sales. Ini pipeline/komitmen, bukan uang masuk. Tidak memakai booking.originalMarks sebagai total universal.
4. **Biaya tutor earned (IDR):** fee event yang sudah earned berdasarkan tanggal earned. Pisahkan kewajiban belum dibayar dari payout paid berdasarkan alokasi aktif; jangan menyebut selisih top-up dan tutor fee sebagai laba, karena waktu dan basisnya berbeda. Report correction/reassignment tidak menulis ulang kepemilikan fee earned.

Filter periode memakai Asia/Jakarta untuk batas tanggal dan UTC untuk penyimpanan. Ringkasan pipeline diberi label “as of now”, terpisah dari metrik flow dalam periode. Tampilkan definisi ringkas/tooltips dan empty state bila sumber data belum tersedia; jangan mengganti data yang hilang dengan angka nol seolah sudah terverifikasi.

Metrik keputusan bisnis utama: penerimaan top-up untuk arus masuk, Marks delivered untuk pemakaian layanan, pipeline untuk permintaan mendatang, dan fee earned/unpaid untuk kewajiban tutor. Konversi Marks menjadi estimasi IDR booking value, platform take dan profit/margin tidak termasuk definisi ini.

### Q15 implementation checkpoint — 30 October 2026

Implemented in admin API/dashboard with separate receipt/service/commitment/fee views and explicit source-quality notices. Focused verification: 42 unit tests, 27 PostgreSQL assertions with fixture rollback, 5 synthetic browser cases, web/server/E2E typechecks and production web build passed. Broader release acceptance remains separately tracked; this is not a full launch sign-off.

### Q04 final deadline confirmation — 30 October 2026

Owner answer: “Sampai sesi pengganti mulai”. Ordinary schedule-change penalty-free cancellation applies only to the changed, undelivered session, refunded in Marks. The deadline is the earlier of notification timestamp +24 hours and replacement session start; confirmation must occur strictly before that deadline. Same-time tutor replacement grants no new exit right. Minimum-enrollment postponement retains its separate 72-hour rule. Policy is resolved. Implementation is documented in the active readiness plan; focused acceptance passed, with live Google update acceptance recorded there separately.

### Q04 implementation record — 30 October 2026

The admin session reschedule and student changed-session quote/confirm RPCs implement this policy. The current schedule-change version and server timestamps are stored on the session; a separate version snapshot on each active funded/unfunded allocation prevents post-notice enrollments from claiming the exit. Funded Marks return once per allocation. Unfunded second-installment cancellation returns no Marks and reduces only that installment's unpaid session slice. Delivered/report/earned sessions are rejected, and same-time tutor replacement leaves an existing window intact. Migrations 0081 and 0082 are applied to authorized dev `localhost:6767/cogito-app`; see readiness for focused PostgreSQL, browser and provider evidence.
