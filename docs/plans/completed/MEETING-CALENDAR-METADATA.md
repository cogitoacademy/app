# Google Calendar Event Metadata

Status: Completed (2026-08-27)

## Outcome

Automatically created Google Calendar events now use readable booking metadata:

- Solo events: `Solo session with {Tutor} & {Student}`
- Group events: `Group session with {Tutor}`
- Series events: `Session series with {Tutor}`
- The event description lists the tutor/students, includes the booking's
  learning goal when present, and includes the authenticated Cogito booking
  detail link (`/bookings/{bookingId}`).

The metadata is sent through both the service-account and OAuth Calendar API
paths. Existing Google Calendar events keep their old title; only newly created
events and future retry-created events use the new format. No database migration
is required because the metadata is provider-side.

## Verification

- `google-meeting.provider.test.ts`: service-account and OAuth request payloads
  assert `summary` and `description`.
- `booking.service.test.ts`: scheduling passes the tutor/student title,
  learning goal, and booking deep link to the meeting port.
- Workspace type-check completed successfully.
