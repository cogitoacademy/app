### G16: Tutor Payout Calculation

**PRD:** DL-11 (Tutor Payout)

**Current state:** No endpoint for calculating tutor share from completed bookings.

**Required:**

1. `POST /rpc/admin.getTutorPayouts` — admin views tutor payout summary
   - Parameters: tutor ID, date range
   - Returns: total completed sessions, total Marks earned, Cogito's take, tutor's payout amount
   - Calculation: `tutorPayout = totalEarnings × (1 - COGITO_TAKE_RATE)`

2. `POST /rpc/tutor.getMyPayouts` — tutor views own payout summary
   - Same calculation but scoped to requesting tutor

**Acceptance tests:**

- Admin views tutor payouts → sees correct calculation with COGITO_TAKE_RATE
- Tutor views own payouts → sees only own data
- Payout includes only completed sessions, not cancelled ones

---

### G17: Full Notification Matrix
