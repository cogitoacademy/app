# Economy Rate Control

| Field     | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Status    | Completed                                                                                  |
| Completed | 2026-08-22                                                                                 |
| Scope     | Admin Cogito take schedule, IDR tutor honoraria, role authorization, and booking snapshots |

## Delivered

- Added the persistent singleton economy_config model and migration 0028_economy_config.sql with the client-approved defaults.
- Added admin-only getEconomySettings and updateEconomySettings procedures with Rp 5,000 validation, optimistic version control, and economy_config_updated audit records.
- Added the /admin-economy page with online/offline Cogito base and per-student increment inputs, class-size preview, persistence feedback, and future-booking warning.
- Added the transactional economy update and audit trail; the former tutor-facing `Cogito rate updated` notification fan-out was retired in the 2026-09-02 notification inbox follow-up because tutors do not need the platform take schedule.
- Added baseRatesIdr for tutor profiles. New profiles use IDR honorarium formulas; legacy Marks price maps remain readable.
- Made tutor discovery and booking previews calculate Marks from the active economy config for the selected modality.
- Stored the active economy version, IDR honorarium/take fields, total IDR, total Marks, and pooled Marks in new booking snapshots. Existing snapshots are not rewritten by rate changes.

## Authorization and E2E acceptance

- Student: can view computed Marks pricing but cannot read or update economy settings.
- Tutor: can configure IDR base honoraria and cannot read or update admin economy settings or use Marks as cash-out.
- Admin: can review, update, reload, and restore the active schedule.
- A booking created after an admin update uses the updated schedule and immutable snapshot.

## Verification

- Unit: pricing, discovery, and admin tests pass.
- Integration: packages/api/src/tests/integration/economy-roles.test.ts — 5 passed, including the no-tutor-notification assertion and no-op protection.
- Browser E2E: packages/e2e/src/specs/economy-roles.spec.ts — 3 passed (student, tutor, admin; admin update confirms the tutor notification center stays free of rate-change notices).
- Web typecheck/build passes.

## Notification inbox follow-up (2026-09-02)

- Economy schedule changes no longer create tutor notifications. Existing
  `economy_config_updated:*` rows are retained for history but excluded from the
  inbox and unread count.
- Shell bell items now navigate to their available destination after initiating
  the read-state update. Notification title/time text use the same size with
  contrasting foreground/dimmed colors, and the description is one size larger.
