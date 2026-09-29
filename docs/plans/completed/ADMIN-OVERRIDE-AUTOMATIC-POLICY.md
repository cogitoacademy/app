# Admin Override Automatic Financial Policy

Status: Completed (2026-09-28)

## Goal

Remove the ambiguous manual Marks selector from emergency overrides and account for both student wallet treatment and tutor payment eligibility.

## Policy

| Category            | Student held Marks | Tutor payment |
| ------------------- | ------------------ | ------------- |
| `student_no_show`   | Forfeit            | Eligible      |
| `tutor_no_show`     | Return             | Not eligible  |
| `medical_emergency` | Return             | Not eligible  |
| `technical_failure` | Return             | Not eligible  |
| `admin_correction`  | Return             | Not eligible  |
| `force_cancel`      | Return             | Not eligible  |

## Completed work

- [x] Centralize category policy in the admin-booking service.
- [x] Automatically include every student participant and the assigned tutor for notification, even without a tutor participant row.
- [x] Apply wallet actions only to non-tutor participants.
- [x] Persist tutor payout eligibility in override metadata.
- [x] Include eligible `student_no_show` overrides in tutor payout aggregation.
- [x] Replace manual Marks/participant selectors with a read-only roster and named booking/wallet/payout outcome preview.
- [x] Add category regression tests and update reference/operations documentation.
