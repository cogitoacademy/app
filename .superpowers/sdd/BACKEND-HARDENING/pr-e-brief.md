## PR E — Spec / Docs Sync

### Task E1: Update PRD-GAPS-SPEC.md to verified state

**Files:**

- Modify: `docs/plans/active/PRD-GAPS-SPEC.md`

**Interfaces:**

- Produces: spec reflects reality; adds G20 (scheduler-never-boots); fixes stale statuses.

- [ ] **Step 1:** Apply these edits:
- **G2:** Change "Current state" to note the repeatable 5-min job is now wired on main (was "not running"). Add acceptance sub-item "Notification on expiry" as the remaining gap.
- **G5:** Note H-2 window IS enforced on whole-booking cancel; real gap is per-session `cancelSession`.
- **G8:** Change "null cursor (N9)" to "pagination fixed by PR #28 (`admin-booking.repo.ts:31-33`); urgency sorting + SLA + filters still missing."
- **G11:** Change "current state" claim — link is created only on tutor accept (not at confirmation); gating largely satisfied by state machine; explicit placeholder UX is the remaining gap.
- **G14:** Note `room.assign` exists (approve-equivalent); relocate/cancel missing.
- **G7:** Fix "no `_sessionNote` column" claim → "dead `sessionNote` input on `completeSessionInput` (`booking.types.ts:107`) that the handler never passes to the service (`booking.handler.ts:300-315` calls `booking.completeSession(input.bookingId, ...)` only)."
- **Add G20:** Scheduler never boots — `initScheduler()` defined but never called in `apps/server/src/index.ts`. Status: Fixed by PR C task C1. Depends: G2/G3 need scheduler running.
- **Version notes:** add v1.3 (2026-08-12) entry.

- [ ] **Step 2:** Keep G1–G18 statuses as "not implemented" except where PR C changed them (G19 → implemented after PR C; mark with note).

- [ ] **Step 3: Commit**

```bash
git add docs/plans/active/PRD-GAPS-SPEC.md
git commit -m "docs(plans): sync PRD-GAPS-SPEC with verified code state; add G20 scheduler boot"
```

### Task E2: Update CONTEXT.md and DEFERRED-OPS-TASKS.md

**Files:**

- Modify: `docs/CONTEXT.md`
- Modify: `docs/plans/active/DEFERRED-OPS-TASKS.md`

- [ ] **Step 1:** `CONTEXT.md` edits:
- Remove/repair the stale "N9 NOT fully fixed" paragraph (now fixed).
- Update K3 note: all 3 jobs have `attempts:3` + exponential backoff (no DLQ).
- Add scheduler-boots note to CI/CD/Deployment section: `SCHEDULER_ENABLED=true` + `REDIS_URL` required.
- Update plans table status for DEFERRED-OPS (1.4/1.5/1.7/1.8 → done in these PRs).

- [ ] **Step 2:** `DEFERRED-OPS-TASKS.md`: mark 1.4, 1.5, 1.7, 1.8 ✅ with PR references; move §2 Redis session caching to "Deferred / needs separate plan" note.

- [ ] **Step 3: Commit**

```bash
git add docs/CONTEXT.md docs/plans/active/DEFERRED-OPS-TASKS.md
git commit -m "docs: sync CONTEXT and DEFERRED-OPS with backend hardening PRs"
```

---

## Roadmap (execution order + concern mapping)
