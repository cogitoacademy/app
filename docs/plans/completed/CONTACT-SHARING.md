# Consent-based contact sharing

Status: **Completed — merged to main via #108 (2026-08-26).** Moved from
`docs/plans/active/` to `docs/plans/completed/` on 2026-09-01 (plans index
sync).

## Product decision

Students may reconnect after a completed shared group session through a small
request flow. The product does not expose a general student directory, phone
numbers, or a full chat feature.

1. Eligibility is a shared booking whose state is `completed`.
2. Only confirmed/reconfirmed student participants who were not marked absent
   are eligible peers.
3. The requester can send an optional note of up to 200 characters.
4. The recipient chooses `Share email`, `Accept privately`, or `Decline`.
5. Only the original requester receives the recipient's account email, and
   only after `Share email`.
6. Each student can turn off new requests from Profile → Contact privacy.

## Implementation

- Added `contact_request` persistence with a directional booking/user unique
  index, explicit `email_shared` consent, status checks, and foreign keys.
- Added student-only oRPC procedures:
  `/rpc/contact/booking/list`, `/rpc/contact/request`, and
  `/rpc/contact/respond`.
- Added in-app notifications and audit records that contain IDs, names,
  decisions, and optional notes only; contact email is never copied into these
  records or into email dispatch.
- Added the completed-booking Contact panel and the profile visibility setting.
- Changed student search, tutor discovery, and booking participant/meeting
  projections to safe display fields so email is not leaked through adjacent
  reads.

## Verification

- `packages/api/src/tests/integration/contact-sharing.test.ts` covers pending
  privacy, private acceptance, explicit email sharing, outsider/incomplete
  booking rejection, opt-out, booking reads, notifications, and audit rows.
- `packages/e2e/src/specs/contact-sharing.spec.ts` inspects raw tutor and
  student-search RPC responses plus rendered UI to prove seed emails are not
  exposed.
- `bun run check-types` passes; targeted unit/integration tests pass; the full
  2,237-test coverage run has 0 failures and the API/overall line gates are
  both 100%.

## Follow-up

Done: merged via #108 (2026-08-26); moved to `docs/plans/completed/` and the
plans index records the merge number (2026-09-01).
