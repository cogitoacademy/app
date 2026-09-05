# Google Calendar Event Metadata

Status: Completed (2026-08-29; offline lifecycle extension 2026-09-03; online reschedule sync fix 2026-09-05)

## Outcome

Automatically created Google Calendar events now use readable booking metadata:

- Solo events: `Cogito - {Competition} | {Tutor} x {Student}`
- Group/group-series events: `Cogito - {Competition} | {Tutor} x {Student} & Friends`
- The event description lists the tutor/students, includes the booking's
  user-facing Session Notes when present, and includes the authenticated
  Cogito booking detail link (`/bookings/{bookingId}`). Session Notes may
  include pasted reference links.

The metadata is sent through both the service-account and OAuth Calendar API
paths. Existing Google Calendar events keep their old title; only newly created
events and future retry-created events use the new format. Booking creation
validates the tutor specialization and snapshots its category/specialization metadata
in `booking.session_topic` via migration 0037.

The authenticated booking list and detail header now reuse the same canonical
event-title formatter. Group bookings therefore show the compact
`Cogito - {Competition} | {Tutor} x {Student} & Friends` title in-app as well as
in Google Calendar/Meet; participant names remain available in the roster.

## Follow-up (2026-08-28)

The booking form now presents the pre-session context as one `Session Notes`
field. The field accepts free text, including pasted `http://` and `https://`
reference links, and the same content is rendered under a `Session Notes:`
heading in newly created Calendar/Meet event descriptions. The existing
`learningGoal` API key and `learning_goal` database column remain as a
compatibility carrier for now; file upload/Calendar attachments are deferred.

## Offline extension (2026-09-03)

Room assignment creates a standard Calendar event after the database
transaction commits. It uses the same summary, description, attendees, and
schedule as online events, adds the assigned room name/location, and omits
conference data. Room relocation and accepted rescheduling update the same
event; terminal booking paths delete it. Creation is idempotent against the
live local provider row, and all provider writes remain best-effort.

## Online reschedule sync fix (2026-09-05)

Provider updates now request attendee notifications and conference-data
support on both OAuth and service-account paths. An accepted online
reschedule therefore propagates the new slot to guest calendars while keeping
the existing Google Meet conference attached to the event.

## Verification

- `google-meeting.provider.test.ts`: service-account and OAuth request payloads
  assert `summary` and `description`.
- `booking.service.test.ts`: scheduling passes the tutor/student title,
  Session Notes (including a reference link), and booking deep link to the
  meeting port.
- `booking-event-title.test.ts`: solo, group, and legacy-booking title parity.
- Workspace type-check completed successfully.
