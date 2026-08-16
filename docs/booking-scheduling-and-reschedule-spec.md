# Booking Scheduling and Reschedule Specification

## Document control

| Version | Date       | Status               | Summary                                                                                                      |
| ------- | ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1.0.0   | 2026-08-16 | Implemented baseline | Availability windows, fixed 90-minute sessions, learning goals, inferred series, and multiparty rescheduling |

## Scheduling invariants

- Every booking session lasts exactly 90 minutes. Clients submit a start time; the server derives the end time.
- Tutor availability represents a window, for example 09:00–17:00, rather than one bookable session.
- A student may choose any minute-level start whose complete 90-minute session fits inside an active tutor window.
- A tutor may counter-propose outside their published window. All proposals still last 90 minutes and must not overlap another active booking.
- Time intervals are half-open (`start <= t < end`), so back-to-back sessions are valid.
- Declined, cancelled, expired, refunded, and other terminal bookings do not reserve tutor time.
- Requests include a learning goal of up to 2,000 characters for tutor preparation.

## Booking shape

- Participation is solo or group.
- One selected session means one-time; two to four selected sessions means series.
- The UI infers recurrence from the selected session count.

## Reschedule negotiation

- The tutor or booking proposer may create or counter a proposal.
- A new proposal supersedes the previous pending proposal.
- Series sessions are negotiated independently by `sessionId`.
- The tutor and every active, confirmed student must accept.
- The proposal creator is automatically accepted; all other voters remain pending.
- The original schedule remains authoritative until unanimous acceptance.
- Any voter may reject; rejection preserves the original schedule.
- Proposals expire after 24 hours. Existing Marks holds remain governed by the original booking lifecycle.

## Cross-browser input

Scheduling surfaces must not depend on native `datetime-local` or native time pickers. Date and minute-level `HH:MM` controls are composed explicitly so Chromium and Firefox expose the same capability. The UI displays the derived end time as start plus 90 minutes.
