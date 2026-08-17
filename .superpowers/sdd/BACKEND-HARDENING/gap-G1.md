### G1: Report Tutor Lateness/No-Show

**PRD:** FR-14 (Support Ticket System), DL-26 (Lateness Tolerance)

**Current state:** No support ticket model. No lateness reporting endpoint.

**Required:**

1. **New table:** `supportTicket`
   - `id` (uuid PK)
   - `reporterId` (FK → user)
   - `bookingId` (FK → booking)
   - `category` enum: `tutor_late`, `tutor_no_show`, `technical`, `payment`, `other`
   - `description` text
   - `status` enum: `open`, `in_progress`, `resolved`, `closed`
   - `slaDeadline` timestamp (12 hours from creation for lateness)
   - `assignedTo` (FK → user, nullable, admin)
   - `resolution` text (nullable)
   - `createdAt`, `updatedAt`

2. **New module:** `support`
   - `POST /rpc/support.createTicket` — student reports lateness/no-show
   - `POST /rpc/support.listTickets` — student sees own tickets
   - `POST /rpc/admin.listTickets` — admin sees all tickets, sorted by SLA urgency
   - `POST /rpc/admin.resolveTicket` — admin resolves ticket

3. **Business rules:**
   - Student can report lateness if booking start time + 15 minutes has passed and tutor hasn't joined
   - Student can report no-show if booking start time + 15 minutes has passed and no attendance
   - SLA: admin must respond within 12 hours (configurable)
   - Ticket auto-escalates if SLA deadline passes without response

**Acceptance tests:**

- Student reports tutor 20 minutes late → ticket created with SLA deadline
- Student reports no-show → ticket created, booking status updated
- Admin lists tickets sorted by urgency (SLA deadline ascending)
- Admin resolves ticket → student notified

---

### G2: 12-Hour Deadline Enforcement by Scheduler
