### G4: Group Repricing Recalculation

**PRD:** FR-16 (Group Pricing Adjustment)

**Current state:** Group bookings have a fixed price set at creation time. If headcount changes (someone drops out during reconfirmation), the price per student doesn't update.

**Required:**

1. When a participant withdraws from a group booking during reconfirmation:
   - Recalculate price per student using pricing service
   - Update `booking.holdAmount` for remaining participants
   - Release excess held funds for the withdrawing student
   - Adjust held amounts for remaining participants (increase if per-student price went up due to fewer students)
   - Send reconfirmation notification with updated price

2. When a participant joins a group booking (waitlist or invitation):
   - Recalculate price per student
   - Reduce per-student hold amount (more students = lower per-student price)
   - Hold funds for new participant
   - Release excess held funds for existing participants

**Acceptance tests:**

- Group of 4 at 28 Marks/student → 1 drops out → remaining 3 at 35 Marks/student, holds adjusted
- Group of 3 at 35 Marks/student → 1 joins → all 4 at 28 Marks/student, excess released
- Reconfirmation notification shows updated price

---

### G5: Series Cancellation Rules
