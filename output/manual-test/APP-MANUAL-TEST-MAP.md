# App manual test map

Source review: 2026-10-29. Planning artifact; no new seed was executed. Scenarios are a starting coverage map, not exhaustive combinations or evidence of passing tests. Use separate student, tutor and admin sessions. Record result, entity ID, screenshots/log evidence and ledger changes for every scenario. External payment/email/meeting delivery needs separate provider validation.

## Booking

- **Student · solo / group / series**: Pilih tutor, modality, jadwal → wallet hold
- **Group**: awaiting_participant_confirmation → awaiting_tutor_review
- **Tutor review**: awaiting_tutor_review → confirmed / declined / reschedule_proposed
- **Harga / peserta berubah**: awaiting_reconfirmation → tutor review / confirmed / expired
- **Online / offline**: confirmed → scheduled ATAU awaiting_admin_room_approval → scheduled
- **Delivery**: scheduled → completed / no_show / cancelled / late_cancelled
- **Reschedule**: reschedule_proposed → review / confirmed / scheduled / room approval / reconfirmation / declined / expired
- **Terminal**: completed, declined, cancelled, late_cancelled, no_show, expired

| ID  | Actor           | Action and expected checks                                                                       | Result / entity / evidence |
| --- | --------------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| B01 | Student → tutor | Solo online: request → accept → scheduled → report complete; hold, deduction, report, fee cocok. | Not run                    |
| B02 | Student × 2–6   | Group: accept / decline / withdraw; headcount, harga dan reconfirmation konsisten.               | Not run                    |
| B03 | Admin + tutor   | Offline: room approval / pindah room / konflik room; tidak double-book.                          | Not run                    |
| B04 | Tutor + student | Reschedule: accept / reject / expiry; jadwal dan meeting sesuai hasil keputusan.                 | Not run                    |
| B05 | Student + admin | Cancel sebelum/sesudah cutoff; bandingkan release/refund dengan policy di UI.                    | Not run                    |
| B06 | Tutor + admin   | No-show student/tutor, late cancel, expired review; alasan dan ledger tersimpan.                 | Not run                    |
| B07 | Tutor           | Series: complete satu child, child lain scheduled/cancelled; fee tidak dihitung dua kali.        | Not run                    |
| B08 | Student         | Saldo kurang / jadwal bentrok / stale version / klik ulang; tidak ada hold ganda.                | Not run                    |

Sources: booking/booking-transitions.ts · booking/booking.service.ts

## Classes

- **Admin authoring**: draft → published; cohort ≥1 sesi / masterclass tepat 1 sesi
- **Student plan**: cohort: full / half / single · masterclass: satu harga
- **Checkout**: checkout_pending → active / expired / cancelled
- **Half installment**: funded pertama → pending kedua → funded / defaulted
- **Seat allocation**: checkout_reserved / unfunded_reserved → funded / released
- **Cohort minimum**: minimum check → keputusan admin: lanjut / postpone / cancel
- **Session delivery**: scheduled → completed / cancelled → report → fee tutor

| ID  | Actor           | Action and expected checks                                                                  | Result / entity / evidence |
| --- | --------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| C01 | Admin           | Draft invalid: tutor, room, waktu, capacity, competition; publish ditolak dengan alasan.    | Not run                    |
| C02 | Student         | Enroll full / half / single / masterclass; jumlah sesi dan total Marks cocok.               | Not run                    |
| C03 | Student         | Saldo kurang → top-up → checkout; expired checkout melepas reservasi.                       | Not run                    |
| C04 | Student         | Half: bayar kedua / lewati due date; unpaid future allocation dilepas sesuai policy.        | Not run                    |
| C05 | Admin + student | Minimum tercapai/tidak tercapai, postpone, free-exit window, cancel; kursi dan Marks cocok. | Not run                    |
| C06 | Student × 2     | Kursi terakhir direbut bersamaan / enroll ulang; tidak oversell atau double hold.           | Not run                    |
| C07 | Tutor           | Sesi complete + report, correction, PDF akses siswa; fee hanya sekali.                      | Not run                    |

Sources: academy-class/* · class-enrollment/* · schema/academy-class*.ts

## Tutors

- **Admin invite**: invited → accepted / expired / revoked
- **Onboarding**: draft → pending_review → changes_requested / approved_unpublished
- **Directory**: approved_unpublished → published / suspended
- **Profile editing**: none / pending_review / changes_requested
- **Booking readiness**: Subjects + modality + availability + capacity + bank/tax

| ID  | Actor         | Action and expected checks                                                            | Result / entity / evidence |
| --- | ------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| T01 | Admin + tutor | Invite valid/expired/revoked, onboarding submit, request changes, approve, publish.   | Not run                    |
| T02 | Student       | Published tutor muncul di direktori; draft/suspended sesuai aturan visibility.        | Not run                    |
| T03 | Tutor + admin | Edit profile pending approval; approve/reject tanpa merusak data published.           | Not run                    |
| T04 | Tutor         | Availability online/offline/both, overlap, capacity; booking memakai opsi yang valid. | Not run                    |
| T05 | Tutor + admin | Bank/tax lengkap, missing, override; payout preview memakai snapshot yang tepat.      | Not run                    |

Sources: schema/tutor-profile.ts · schema/tutor-invite.ts

## Wallet & payouts

- **Payment provider**: PENDING → PAID / SETTLED / FAILED / EXPIRED / REFUNDED
- **Wallet**: credit → hold → release / deduct; total = available + held
- **Completed delivery**: booking / series child / class session → tutor_session_fee
- **Admin payout**: preview → prepared → paid / void
- **Reconciliation**: not_required / required / resolved

| ID  | Actor   | Action and expected checks                                                            | Result / entity / evidence |
| --- | ------- | ------------------------------------------------------------------------------------- | -------------------------- |
| P01 | Student | Top-up success/fail/expire/refund; webhook duplicate tidak menambah kredit dua kali.  | Not run                    |
| P02 | Student | Ledger dan saldo available/held/total cocok setelah semua cabang booking/classes.     | Not run                    |
| P03 | Admin   | Preview eligible unpaid fees, tax status/override, transfer fee; net cocok.           | Not run                    |
| P04 | Admin   | Prepare → record paid; source tidak bisa dialokasikan ke dua payout aktif.            | Not run                    |
| P05 | Admin   | Void prepared; source tersedia lagi sesuai policy.                                    | Not run                    |
| P06 | Admin   | Transfer mismatch / reconciliation required → resolved; evidence dan audit tersimpan. | Not run                    |

Sources: schema/payment-record.ts · schema/wallet.ts · schema/tutor-payout*.ts

## Referral & KOL

- **Signup choice**: none / friend / kol; snapshot attribution
- **Friend**: welcome credit → qualifying first completion → reward dengan semester cap
- **KOL**: campaign + code → qualifying payment → commission decision
- **Commission basis**: verified success time / unresolved; refund reconciliation
- **Manual settlement**: transfer / adjustment → saldo obligation vs paid

| ID  | Actor       | Action and expected checks                                                                       | Result / entity / evidence |
| --- | ----------- | ------------------------------------------------------------------------------------------------ | -------------------------- |
| R01 | New student | No code / valid friend / valid KOL / invalid atau expired code; choice dan welcome credit cocok. | Not run                    |
| R02 | Friend pair | First qualifying completion reward sekali; ulang completion tidak double-credit.                 | Not run                    |
| R03 | Admin       | Semester cap: remaining, exact cap, exhausted; credited Marks tidak lewat cap.                   | Not run                    |
| R04 | Admin       | Campaign sebelum aktif / aktif / expired; attribution window sebelum/sesudah batas.              | Not run                    |
| R05 | Admin       | KOL first purchase vs repeat; flat + percent sesuai snapshot, duplicate event aman.              | Not run                    |
| R06 | Admin       | Missing provider success time, partial/full refund; komisi dan reconciliation sesuai fakta.      | Not run                    |
| R07 | Admin       | Unpaid / partial / fully settled / adjustment; double operation tidak double-transfer.           | Not run                    |

Sources: referral/referral.service.ts · referral/kol-settlement.policy.ts · schema/referral.ts

## Notifications

- **Domain event**: Booking / payment / refund / schedule / achievement / system / override
- **Notification write**: eventKey dedupe → notification row → inbox unread/read
- **Email gate · semua wajib**: emailRequired=true + action/critical + supported category + recipient email
- **Outbox**: notification_dispatch: queued → claim → sending
- **Delivery result**: sent / suppressed / failed
- **Recovery**: failed retry <3 attempts; stale sending >10 menit dapat di-claim jika budget tersedia

| ID  | Actor                   | Action and expected checks                                                                | Result / entity / evidence |
| --- | ----------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| N01 | Student + tutor + admin | Trigger satu event: recipient benar, isi dan action link menuju record yang tepat.        | Not run                    |
| N02 | Same recipient          | Replay eventKey → satu notification; inbox unread count dan read/unread konsisten.        | Not run                    |
| N03 | Recipient               | Info / emailRequired=false → in-app saja; action/critical lolos gate → outbox.            | Not run                    |
| N04 | Recipient               | Achievement/system tidak lolos email category gate; inbox tetap tersedia.                 | Not run                    |
| N05 | Worker                  | Queued → sending → sent; provider skipped → suppressed; error → failed + attempts.        | Not run                    |
| N06 | Worker                  | Retry / stale claim / attempts habis; tidak double-send, idempotency memakai dispatch ID. | Not run                    |
| N07 | Other account           | Tidak bisa baca atau mark-read notification milik akun lain.                              | Not run                    |

Sources: notification/notification.service.ts · notification/notification.repo.ts

## Other modules

- **Achievement**: draft / pending / pending_review / approved / rejected / archived
- **Support**: open → in_progress → resolved / closed
- **Content & calendar**: Admin create/edit/activate → reader visibility + akses
- **Cross-module**: Authorization · audit · pagination/filter · empty/error · responsive

| ID  | Actor           | Action and expected checks                                                                | Result / entity / evidence |
| --- | --------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| O01 | Student + admin | Achievement submit, approve/reject/archive; public visibility dan evidence sesuai akses.  | Not run                    |
| O02 | Student + admin | Support kategori tutor late/no-show/technical/payment/other; SLA, assignment, resolution. | Not run                    |
| O03 | Admin + student | Knowledge bank + calendar CRUD, active/inactive, filter; private file access diperiksa.   | Not run                    |
| O04 | All roles       | Coba endpoint/action role lain; ditolak tanpa perubahan data.                             | Not run                    |
| O05 | All roles       | Empty/loading/error, filter/page, mobile; audit actor dan reason cocok.                   | Not run                    |

Sources: schema/achievement.ts · schema/support-ticket.ts · schema/content-v3.ts

## Coverage limits

State names and notification gates were checked in source. Scenario outcomes require execution against the current app. Refund amounts, cancellation cutoffs, minimum decision eligibility and payout calculations must use current policy snapshots; do not assume a refund amount from this map. No live provider acceptance, API authorization or money movement was performed. Additional economy configuration, contact requests, FAQ, reporting/export, storage failure and job concurrency combinations need expansion before claiming complete app coverage.
