### G17: Full Notification Matrix

**PRD:** FR-17 (Notification System), PRD §Notification Matrix (prd.tex:912-955)

**Current state:** Notification records are created in DB. `onSendNotificationEmail` is implemented (N2 fixed). The notification service has `EMAIL_SUPPORTED_CATEGORIES` (booking/payment/refund/schedule/override) but the routing is category-level, not event-level. The existing matrix below was invented and does **not match the PRD**. This spec must be aligned to the PRD's source-of-truth matrix.

**Required:**

Implement the full notification matrix **as defined in the PRD** (prd.tex:912-955). The PRD matrix is the source of truth — any discrepancy between this spec and the PRD, the PRD wins:

| Event                                          | In-App | Email | Email Recipient            | Notes (from PRD)                                                                                                                |
| ---------------------------------------------- | ------ | ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Booking request created                        | ✅     | ✅    | Tutor only                 | Action required by tutor                                                                                                        |
| Account created                                | ✅     | ✅    | New student                | Signup confirmation, onboarding entry, login link, brief intro                                                                  |
| Group session or series invitation received    | ✅     | ✅    | Registered invitees        | Email must include full schedule, per-student price, total Marks hold, direct CTA. Phase 0 invitations only to registered users |
| Student or group has confirmed a booking       | ✅     | ✅    | Assigned tutor             | Tutor prep notice. Include student/group name, session type, date, time. For series, list all session dates/times               |
| Booking accepted / declined                    | ✅     | ✅    | Student only               | Critical booking outcome                                                                                                        |
| Online meeting link created                    | ✅     | ✅    | Tutor + confirmed students | Sent only after all required participant, tutor, and admin conditions complete                                                  |
| Offline room confirmed / relocated / cancelled | ✅     | ✅    | Tutor + confirmed students | Critical operational notices                                                                                                    |
| Student cancel before H-2                      | ✅     | ✅    | Affected participants      | Schedule-affecting change                                                                                                       |
| Late cancel / no-show / emergency override     | ✅     | ✅    | Affected participants      | Penalty or correction event                                                                                                     |
| Tutor reschedule proposed / approved           | ✅     | ✅    | Affected participants      | Requires student approval                                                                                                       |
| Group repricing / reconfirmation request       | ✅     | ✅    | All current participants   | Cost changes must be explicit                                                                                                   |
| Payment / refund / emergency refund            | ✅     | ✅    | Payer                      | Wallet event                                                                                                                    |
| Achievement submitted / reviewed               | ✅     | ❌    | —                          | Keep review traffic in-app                                                                                                      |
| Reminder / non-critical update                 | ✅     | ❌    | —                          | Never consumes email quota                                                                                                      |

**Implementation notes:**

- The current `EMAIL_SUPPORTED_CATEGORIES` set (booking/payment/refund/schedule/override) is too coarse. The routing needs to distinguish within a category (e.g., "achievement" events in the "booking" category should NOT email, but "booking accepted" should).
- Add an `emailRequired: boolean` flag or per-event routing function rather than category-level gating.
- Email dispatch is best-effort, rate-limited, and deduplicated by event key (PRD §Notification Matrix closing note).
- In-app notifications are the source of record for all events.

**Acceptance tests:**

- Each event type creates the correct notification records
- Email dispatch happens for events marked ✅ in Email column, to the correct recipient
- Email is NOT sent for achievement events or non-critical reminders
- In-app notification visible in notification list for all events
- Email includes required content per PRD (e.g., group invite email includes full schedule + price + total hold + CTA)
- N2 bug fix ensures `onSendNotificationEmail` actually dispatches

---

### G18: Series Session Completion
