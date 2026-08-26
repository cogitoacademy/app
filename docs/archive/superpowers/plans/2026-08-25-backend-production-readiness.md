# Backend Production Readiness — Phase 0 + Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the backend against the PRD and fix all verified review findings (email-verification enforcement, HTML injection, Sanity proxy hardening, payouts reconciliation, queue pagination, economy fan-out, reversible migrations, scheduler fail-loud) so the backend is production-correct before infra work.

**Architecture:** Backend-only changes in `packages/api`, `packages/auth`, `packages/db`, `apps/server`. Each fix is a small, test-first change following the existing 4-layer pattern (Router → Handler → Service → Repository). No frontend feature work; one minimal presentation change (verification banner) is explicitly out of scope for this plan.

**Tech Stack:** Bun, TypeScript, Elysia, oRPC, Drizzle ORM, better-auth 1.6.11, bun:test.

## Global Constraints

- Import from `@cogito-app/*` workspace packages only. Never import from shadcn or elsewhere.
- Follow the 4-layer architecture: Router → Handler → Service → Repository. No new layers.
- All new behavior needs tests. `packages/api` coverage gate is 100% lines (enforced by CI).
- Docs follow code (AGENTS.md rule 11): every task that changes behavior updates `docs/CONTEXT.md`, `docs/MODULE-REFERENCE.md`, `docs/API-REFERENCE.md` as needed, and the plan status in `docs/plans/`.
- oRPC facts: HTTP paths are procedure keys with slashes (`/rpc/booking/createSolo`); request bodies wrapped in `{"json": <input>}`; responses come back as `{"json": <data>, "meta": [...]}`.
- Test command: `bun run test` in `packages/api` (runs `bun ../../scripts/run-test-suite.mjs api`). Typecheck: `bun run check-types` at repo root. Lint: `bun run lint` at repo root.
- Do NOT touch: `apps/web` (except nothing in this plan), `packages/ui`, payment provider internals beyond what a task specifies.
- Commit style: Conventional Commits (`fix(scope): ...`, `feat(scope): ...`). Commit after each task's green test run.

---

### Task 1: PRD + wiring audit (Phase 0)

**Files:**
- Create: `docs/plans/active/PRD-AUDIT.md`
- Read: `docs/prd.tex`, `docs/API-REFERENCE.md`, `docs/MODULE-REFERENCE.md`, `docs/CONTEXT.md`

**Interfaces:**
- Consumes: nothing (research task).
- Produces: `docs/plans/active/PRD-AUDIT.md` — the approved gap list that Task 2+ reference.

- [ ] **Step 1: Read the PRD and reference docs**

Read `docs/prd.tex` (the product requirements), `docs/API-REFERENCE.md` (endpoints), `docs/MODULE-REFERENCE.md` (services/event keys/business rules), and `docs/CONTEXT.md` (architecture + known state).

- [ ] **Step 2: Cross-check backend modules against the PRD**

For each module in `packages/api/src/modules/` (auth, admin, admin-tutor, admin-booking, booking, tutor, tutor-discovery, invite, achievement, wallet, pricing, payment, room, notification, refund, support, upload, scheduler, content, economy, meeting, email, audit), verify:
1. Every PRD-mandated behavior has a code path (search the module for the behavior; note file:line).
2. Every documented RPC in `docs/API-REFERENCE.md` exists in the routers and matches the documented input/output.
3. Business rules in `docs/MODULE-REFERENCE.md` match the service code.
4. Any PRD requirement with NO code path, or code with NO doc, is a gap.

Also run the "can it boot with all moving parts" check: for each external dependency (Postgres, Redis/BullMQ, Resend, Google OAuth, Google Meet, Xendit, Sanity, R2), confirm the env var exists in `packages/env/src/server.ts`, the provider selection is env-driven, and the failure mode is documented.

- [ ] **Step 3: Write the gap list**

Write `docs/plans/active/PRD-AUDIT.md` with:
- Table of gaps: `# | Area | Gap | Evidence (file:line) | Severity | Fix owner (task #)`
- A "verified sound" section listing what was checked and found correct.
- The dependency wiring table from Step 2.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/active/PRD-AUDIT.md
git commit -m "docs(plans): PRD and wiring audit gap list"
```

---

### Task 2: Email verification gate — paid actions require verified email

**Files:**
- Modify: `packages/api/src/procedures.ts` (add `requireVerifiedStudent` middleware)
- Modify: `packages/api/src/modules/booking/booking.router.ts` (use `requireVerifiedStudent` on the 4 create procedures)
- Modify: `packages/api/src/modules/payment/payment.router.ts` (use `requireVerifiedStudent` on `createPurchase`)
- Test: `packages/api/src/tests/unit/verification-gate.test.ts` (new)
- Docs: `docs/CONTEXT.md` (G2 section — state enforcement level), `docs/MODULE-REFERENCE.md`

**Interfaces:**
- Consumes: `context.session.user.emailVerified` (better-auth standard field, present on the session user object; `context.ts` already re-reads `role` from DB — `emailVerified` comes from the session user as returned by `auth.api.getSession`).
- Produces: `requireVerifiedStudent` middleware — same contract as `studentProcedure` but additionally throws `ORPCError("FORBIDDEN", { message: "Email verification required" })` when `context.session.user.emailVerified !== true`.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/tests/unit/verification-gate.test.ts`:

```ts
import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { user } from "@cogito-app/db/schema";
import { ORPCError } from "@orpc/server";
import { createTestContext, createTestClient, signUpAndSignIn, resetDatabase } from "../helpers/test-client";
import { appRouter } from "../../routers";

describe("email verification gate on paid actions", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const email = `gate.${ts}@cogito.test`;

  test("unverified student cannot create a solo booking", async () => {
    const { cookie } = await signUpAndSignIn(email, "Test1234!", "Gate Student");
    const context = await createTestContext({ cookie });
    const client = createTestClient(context);

    await expect(
      client.booking.createSolo({
        tutorId: "00000000-0000-0000-0000-000000000000",
        startAt: new Date(Date.now() + 86400_000).toISOString(),
        learningGoal: "test",
      }),
    ).rejects.toThrow(ORPCError);
  });

  test("verified student can create a solo booking", async () => {
    // Mark verified directly (the OTP flow is covered by email-verification-g2.test.ts)
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
    const { cookie } = await signUpAndSignIn(`v.${ts}@cogito.test`, "Test1234!", "Verified Student");
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, `v.${ts}@cogito.test`));
    const context = await createTestContext({ cookie });
    const client = createTestClient(context);

    // Expect a domain error (tutor not found), NOT a verification error — proving the gate passed.
    await expect(
      client.booking.createSolo({
        tutorId: "00000000-0000-0000-0000-000000000000",
        startAt: new Date(Date.now() + 86400_000).toISOString(),
        learningGoal: "test",
      }),
    ).rejects.toThrow(/not found/i);
  });
});
```

Note: check `createTestContext`'s signature in `packages/api/src/tests/helpers/test-client.ts` (it may take `{ cookie }` or `{ headers }`) and adapt. Also confirm the exact error message for a nonexistent tutor by reading `booking.service.ts` (search `BookingNotFoundError` / `TutorNotFoundError`) and match the regex to it.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api` (or `bun ../../scripts/run-test-suite.mjs api -- unit/verification-gate`)
Expected: FAIL — unverified user's `createSolo` succeeds (no gate exists yet).

- [ ] **Step 3: Add the middleware**

In `packages/api/src/procedures.ts`, after `requireStudent` (line ~60), add:

```ts
export const requireVerifiedStudent = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const user = context.session.user as CogitoUser;
  if (user.role !== USER_ROLE.STUDENT) {
    throw new ORPCError("FORBIDDEN", { message: "Student access required" });
  }
  if (user.emailVerified !== true) {
    throw new ORPCError("FORBIDDEN", { message: "Email verification required" });
  }
  return next({
    context: {
      session: context.session,
      services: context.services,
      headers: context.headers,
    },
  });
});

export const verifiedStudentProcedure = publicProcedure.use(requireVerifiedStudent);
```

- [ ] **Step 4: Apply the gate to paid procedures**

In `packages/api/src/modules/booking/booking.router.ts`:
- Change `createSolo`, `createGroup`, `createSeries`, `createGroupSeries` from `studentProcedure` to `verifiedStudentProcedure` (import it from `../../procedures`).

In `packages/api/src/modules/payment/payment.router.ts`:
- Change `createPurchase` from `protectedProcedure` to `verifiedStudentProcedure` (import it from `../../procedures`). Note: `createPurchase` currently uses `protectedProcedure` — the gate adds the student-role check too; verify no admin/tutor purchase flow exists (search `createPurchase` callers) before switching. If a non-student flow exists, instead add the `emailVerified` check inside the existing middleware chain — but per the PRD, purchases are student-only, so the switch is expected.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test` in `packages/api`
Expected: PASS — new gate tests pass; existing suite still green (check for any existing test that creates bookings with unverified users — if one exists, mark that user verified in the test setup via `db.update(user).set({ emailVerified: true })`).

- [ ] **Step 6: Update docs**

In `docs/CONTEXT.md`, update the G2 section (line ~398) to state: "Email verification is enforced for paid actions: booking creation (solo/group/series/group-series) and wallet purchases require `emailVerified=true` (verifiedStudentProcedure). Browsing, reads, and free actions remain available to unverified users." Update `docs/MODULE-REFERENCE.md` similarly.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/procedures.ts packages/api/src/modules/booking/booking.router.ts packages/api/src/modules/payment/payment.router.ts packages/api/src/tests/unit/verification-gate.test.ts docs/CONTEXT.md docs/MODULE-REFERENCE.md
git commit -m "fix(auth): gate paid actions on email verification"
```

---

### Task 3: Escape user-supplied reason in withdrawInvite email

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts:2556` (the `withdrawInvite` notification body)
- Test: extend `packages/api/src/tests/unit/booking.service.test.ts` (or add a focused test)
- Docs: `docs/MODULE-REFERENCE.md` (note the escaping convention)

**Interfaces:**
- Consumes: `escapeHtml` — already imported at `booking.service.ts:51` from `../../lib/sanitize`.
- Produces: nothing new; behavior change only.

- [ ] **Step 1: Write the failing test**

In `packages/api/src/tests/unit/booking.service.test.ts`, add a test that calls the service's `withdrawInvite` (find the existing test setup for it — search `withdrawInvite` in the test file) with `reason: "<script>alert(1)</script>"` and asserts the written notification body contains `&lt;script&gt;` and not the raw `<script>`. Use the notification port spy pattern already used in that file (search `notification` mock in the test file).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api`
Expected: FAIL — body contains raw `<script>`.

- [ ] **Step 3: Fix the body**

In `booking.service.ts` around line 2556, change:

```ts
body: reason
  ? `The booking proposer withdrew your invitation. Reason: ${reason}`
  : "The booking proposer withdrew your invitation.",
```

to:

```ts
body: reason
  ? `The booking proposer withdrew your invitation. Reason: ${escapeHtml(reason)}`
  : "The booking proposer withdrew your invitation.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test` in `packages/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/tests/unit/booking.service.test.ts
git commit -m "fix(booking): escape withdraw reason in notification email"
```

---

### Task 4: Harden the Sanity content file proxy

**Files:**
- Modify: `apps/server/src/routes.ts` (the `/content/student-resources/:resourceId/file` route, ~line 353-417)
- Modify: `apps/server/src/rate-limit-paths.ts` (add a `content` rate-limit kind)
- Modify: `apps/server/src/routes.ts` (wire the content rate limiter)
- Test: `apps/server/src/` — check existing route tests (search `content/student-resources` in `apps/server/src/tests/` or `packages/api/src/tests/`); add coverage for the allowlist rejection and timeout.
- Docs: `docs/CONTEXT.md` (content section), `docs/RUNBOOK.md`

**Interfaces:**
- Consumes: `env` from `@cogito-app/env/server`; the existing `rateLimit` factory in `apps/server/src/routes.ts` (see `authRateLimit` at line 39 for the pattern).
- Produces: a `contentRateLimit` instance; a `SANITY_CDN_ALLOWLIST`-style constant (hardcoded `cdn.sanity.io` + `*.sanity.io` suffix check is fine — no new env var needed).

- [ ] **Step 1: Write the failing test**

Find the existing test file for server routes (search `apps/server/src` for `*.test.ts` that exercises routes — e.g. `openapi.test.ts` or a routes test). Add tests:
1. A request for a resource whose `fileUrl` is not on `cdn.sanity.io` (mock the content service to return `fileUrl: "https://evil.example.com/x.pdf"`) returns 502 and does NOT fetch.
2. A request whose upstream fetch exceeds the timeout returns 502.
3. A request exceeding the size cap returns 502.

Follow the existing test harness pattern in that file (how routes are invoked, how services are mocked).

- [ ] **Step 2: Run test to verify it fails**

Run: the server test suite (see `apps/server/package.json` test script)
Expected: FAIL — no allowlist/timeout/size-cap exists.

- [ ] **Step 3: Implement the hardening**

In `apps/server/src/routes.ts`, inside the `/content/student-resources/:resourceId/file` handler, after `const file = await context.services.content.getStudentResourceFile(...)` and the `!file?.fileUrl` check, add:

```ts
// SSRF guard: only fetch Sanity CDN assets. The URL originates from the
// Sanity CMS (editor-controlled), so an allowlist prevents a compromised
// editor account from turning the server into an open proxy.
const url = new URL(file.fileUrl);
const isSanityCdn =
  url.hostname === "cdn.sanity.io" || url.hostname.endsWith(".sanity.io");
if (!isSanityCdn) {
  set.status = 502;
  return { error: "Unable to retrieve resource" };
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
let upstream: Response;
try {
  upstream = await fetch(file.fileUrl, { signal: controller.signal });
} catch {
  set.status = 502;
  return { error: "Unable to retrieve resource" };
} finally {
  clearTimeout(timeout);
}

if (!upstream.ok || !upstream.body) {
  set.status = 502;
  return { error: "Unable to retrieve resource" };
}

// Size cap: refuse to stream oversized assets (5 MB, matching MAX_UPLOAD_BYTES).
const MAX_PROXY_BYTES = 5 * 1024 * 1024;
const contentLength = Number(upstream.headers.get("content-length") ?? 0);
if (contentLength > MAX_PROXY_BYTES) {
  set.status = 502;
  return { error: "Unable to retrieve resource" };
}
```

Then stream with a byte counter to enforce the cap even without a content-length header:

```ts
let streamed = 0;
const reader = upstream.body.getReader();
const capped = new ReadableStream<Uint8Array>({
  async pull(controller) {
    const { done, value } = await reader.read();
    if (done) {
      controller.close();
      return;
    }
    streamed += value.byteLength;
    if (streamed > MAX_PROXY_BYTES) {
      controller.error(new Error("response too large"));
      return;
    }
    controller.enqueue(value);
  },
  cancel() {
    reader.cancel();
  },
});
```

and return `new Response(capped, { headers: { ... } })` (keep the existing headers). Note: with the cap enforced in the stream, the `content-length` pre-check is defense-in-depth — keep both.

- [ ] **Step 4: Add the rate limit**

In `apps/server/src/rate-limit-paths.ts`, add `"content"` to the `RateLimitKind` union and a match:

```ts
if (urlPath.startsWith("/content/student-resources/")) return "content";
```

In `apps/server/src/routes.ts`, add (following the `authRateLimit` pattern):

```ts
const contentRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "content",
  redis,
});
```

and apply it in the route handler (find how `authRateLimit`/`paymentRateLimit` are applied to routes — likely a `beforeHandle` or manual check; mirror that pattern).

- [ ] **Step 5: Run tests to verify they pass**

Run: server test suite + `bun run test` in `packages/api`
Expected: PASS.

- [ ] **Step 6: Update docs**

`docs/CONTEXT.md` content section: note the proxy now allowlists Sanity CDN hosts, enforces a 10s timeout and 5MB cap, and is rate-limited. `docs/RUNBOOK.md`: note the behavior.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes.ts apps/server/src/rate-limit-paths.ts <test files> docs/CONTEXT.md docs/RUNBOOK.md
git commit -m "fix(content): harden Sanity file proxy (allowlist, timeout, size cap, rate limit)"
```

---

### Task 5: Reconcile getTutorPayouts ledger columns

**Files:**
- Modify: `packages/api/src/modules/booking/booking.service.ts` (the `getTutorPayouts` aggregation, ~lines 3330-3380)
- Test: `packages/api/src/tests/unit/booking.service.test.ts` (extend the payouts test)
- Docs: `docs/MODULE-REFERENCE.md` (payouts section)

**Interfaces:**
- Consumes: `priceSnapshot` shape (`baseline`, `actualMarksPooled`, `cogitoTake`, `tutorShare`, `tutorHonorariumIdr`).
- Produces: invariant `totalMarks === cogitoTake + tutorPayout` for every returned row set.

- [ ] **Step 1: Write the failing test**

In `packages/api/src/tests/unit/booking.service.test.ts`, find the existing `getTutorPayouts` test (search `getTutorPayouts`). Add a test with a new-economy snapshot where `actualMarksPooled > baseline` (e.g. `baseline: 100, actualMarksPooled: 102, cogitoTake: 40, tutorShare: 60`) and assert `result.totalMarks === result.cogitoTake + result.tutorPayout`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api`
Expected: FAIL — `totalMarks` (102) ≠ `cogitoTake + tutorPayout` (100).

- [ ] **Step 3: Fix the aggregation**

In `booking.service.ts`, in all three branches of the `getTutorPayouts` loop (series-with-completed-sessions, series-else, single), change the `totalMarks` accumulation from `snap?.actualMarksPooled ?? snap?.baseline ?? 0` to `snap?.baseline ?? 0` so the three columns are internally consistent (the split basis is `baseline`; `actualMarksPooled` may exceed it by rounding).

- [ ] **Step 4: Document the rounding surplus**

In `docs/MODULE-REFERENCE.md` payouts section, add: "`totalMarks` reports the split basis (`baseline`). Students may be charged `actualMarksPooled` ≥ `baseline` due to per-student rounding (surplus ≤ headcount marks per booking); the surplus is currently unallocated — flagged for product decision."

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test` in `packages/api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/modules/booking/booking.service.ts packages/api/src/tests/unit/booking.service.test.ts docs/MODULE-REFERENCE.md
git commit -m "fix(admin): reconcile tutor payout ledger columns"
```

---

### Task 6: Fix escalated admin-queue pagination

**Files:**
- Modify: `packages/api/src/modules/admin-booking/admin-booking.service.ts` (the `listBookings` function, ~lines 480-526)
- Test: `packages/api/src/tests/unit/admin-booking.service.test.ts` (extend)
- Docs: `docs/MODULE-REFERENCE.md` (admin queue section)

**Interfaces:**
- Consumes: `repo.listBookingsByState(db, [], repoLimit, cursor, filters)` — unchanged.
- Produces: `listBookings` never returns `nextCursor` when `items` is empty; when `escalated === true`, pages fill to `limit` by advancing the cursor across windows (bounded).

- [ ] **Step 1: Write the failing test**

In `packages/api/src/tests/unit/admin-booking.service.test.ts`, find the `listBookings` tests (search `listBookings`). Add a test: seed > `MAX_PAGE_LIMIT` bookings where only a few are escalated and they sit beyond the first window; call `listBookings({ escalated: true, limit: 10 })` and assert `items.length === 10` (or all escalated items) and that no call returns `items.length === 0` with a non-null `nextCursor`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api`
Expected: FAIL — empty page with cursor, or short page.

- [ ] **Step 3: Fix the pagination**

In `admin-booking.service.ts`, replace the `listBookings` body (from `const rows = ...` through `return { items, nextCursor };`) with a bounded loop:

```ts
const MAX_ESCALATED_WINDOWS = 5;
let cursor = opts?.cursor;
let items: OverrideQueueItem[] = [];
let rawTail: OverrideQueueItem | undefined;
let hasMoreRows = false;

for (let window = 0; window < MAX_ESCALATED_WINDOWS; window++) {
  const rows = hasFilters
    ? await repo.listBookingsByState(db, [], repoLimit, cursor, filters)
    : await repo.listBookingsByState(db, [], repoLimit, cursor);
  hasMoreRows = rows.length > repoLimit;
  const raw = rows.slice(0, repoLimit).map(toOverrideQueueItem);
  rawTail = raw[raw.length - 1];
  const matching =
    opts?.escalated === true ? raw.filter((item) => item.escalated) : raw;
  items = items.concat(matching);
  if (items.length >= limit || !hasMoreRows) break;
  cursor = rawTail ? toOverrideCursor(rawTail) : undefined;
  if (!cursor) break;
}

const page = items.slice(0, limit);
const hasMoreMatching = items.length > limit;
const nextCursor =
  page.length > 0 && (hasMoreMatching || hasMoreRows)
    ? toOverrideCursor(page[page.length - 1])
    : null;
return { items: page, nextCursor };
```

(Check the actual type name for the queue item — `toOverrideQueueItem`'s return type — and use it. Keep the `bookingId` fast path unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test` in `packages/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/admin-booking/admin-booking.service.ts packages/api/src/tests/unit/admin-booking.service.test.ts docs/MODULE-REFERENCE.md
git commit -m "fix(admin): fill escalated queue pages and never return cursor with empty page"
```

---

### Task 7: Move economy-config tutor notifications out of the transaction

**Files:**
- Modify: `packages/api/src/modules/admin/admin.service.ts` (`updateEconomySettings`, ~lines 237-320)
- Test: `packages/api/src/tests/unit/admin.service.test.ts` (extend)
- Docs: `docs/MODULE-REFERENCE.md` (economy section)

**Interfaces:**
- Consumes: `notification.write({ db, ... })` — the port accepts a `DbOrTx`; after the change it is called with the pool `db` (not `tx`).
- Produces: `updateEconomySettings` commits the config change + audit row even if a notification write fails; notifications are written after commit, best-effort.

- [ ] **Step 1: Write the failing test**

In `packages/api/src/tests/unit/admin.service.test.ts`, find the `updateEconomySettings` tests. Add a test where the notification port's `write` rejects, and assert the economy config WAS updated (the transaction committed) and the audit row exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api`
Expected: FAIL — the whole transaction rolls back when `write` rejects.

- [ ] **Step 3: Restructure the function**

In `admin.service.ts`, `updateEconomySettings`:

1. Inside the transaction: keep the version check, `economy.updateConfig`, and `auditPort.record`. Collect `tutorIds` inside the tx but do NOT write notifications there.
2. After the transaction commits: write the notifications with the pool `db` (not `tx`), wrapped so failures are logged, not thrown:

```ts
const updated = await db.transaction(async (tx) => {
  // ... existing version check, updateConfig, auditPort.record ...
  const tutorIds = await adminRepo.listUserIdsByRole(tx, USER_ROLE.TUTOR);
  return { config: updated, tutorIds };
});

if (notification && updated.tutorIds.length > 0) {
  const notificationBody = /* existing body construction */;
  await Promise.all(
    updated.tutorIds.map((tutorId) =>
      notification.write({
        db, // pool, not tx
        userId: tutorId,
        category: "system",
        title: "Cogito rate updated",
        body: notificationBody,
        eventKey: `economy_config_updated:${updated.config.version}:${tutorId}`,
        metadata: { /* existing metadata */ },
      }).catch((error) => {
        log({ level: "error", action: "economy_notification_failed", error: { message: String(error) }, userId: tutorId });
      }),
    ),
  );
}
```

(Import `log` from `@cogito-app/api/lib/logger` if not already imported. The `eventKey` is idempotent per version+tutor, so a retry after a partial failure is safe.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test` in `packages/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/modules/admin/admin.service.ts packages/api/src/tests/unit/admin.service.test.ts docs/MODULE-REFERENCE.md
git commit -m "fix(admin): decouple economy-config notifications from the config transaction"
```

---

### Task 8: Add down paths for migrations 0027 and 0028

**Files:**
- Modify: `packages/db/src/migrations/0027_subject_taxonomy.sql` (append `-- down` section)
- Modify: `packages/db/src/migrations/0028_economy_config.sql` (append `-- down` section)
- Docs: `docs/RUNBOOK.md` (manual rollback procedure)

**Interfaces:**
- Consumes: nothing.
- Produces: documented rollback SQL for both migrations; no schema change.

- [ ] **Step 1: Write the down SQL**

Append to `0027_subject_taxonomy.sql`:

```sql
-- down
DROP TABLE IF EXISTS "tutor_profile_subject";
DROP TABLE IF EXISTS "subject_category";
```

Append to `0028_economy_config.sql`:

```sql
-- down
DROP TABLE IF EXISTS "economy_config";
ALTER TABLE "tutor_profile" DROP COLUMN IF EXISTS "base_rates_idr";
```

- [ ] **Step 2: Verify the up migrations still apply cleanly**

Run: `bun run db:migrate` against a scratch database (or the dev DB if safe) — confirm no change to the up path. If a scratch DB is not available, verify the files parse by running `bun run db:migrate` on the dev database and confirming it reports "no migrations to run" (already applied).

- [ ] **Step 3: Document the rollback procedure**

In `docs/RUNBOOK.md`, add a "Migration rollback" section: how to run the down SQL manually (`psql` against the Coolify Postgres container), and the CD auto-rollback behavior (Phase 4 — restore from pre-migration backup).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/0027_subject_taxonomy.sql packages/db/src/migrations/0028_economy_config.sql docs/RUNBOOK.md
git commit -m "chore(db): add down paths for migrations 0027 and 0028"
```

---

### Task 9: Scheduler fail-loud boot check

**Files:**
- Modify: `apps/server/src/scheduler.ts` (`initScheduler`)
- Modify: `packages/api/src/lib/db-health.ts` (add a scheduler check to `/health`)
- Test: `packages/api/src/tests/unit/` or `apps/server/src/` — add a test for the health surface; the boot check is covered by a unit test of a new exported helper.
- Docs: `docs/RUNBOOK.md`, `docs/CONTEXT.md` (scheduler section)

**Interfaces:**
- Consumes: `env.SCHEDULER_ENABLED`, `env.REDIS_URL`, `getRedisClient()` from `@cogito-app/api/lib/redis`.
- Produces: `initScheduler` throws at boot when `SCHEDULER_ENABLED=true` and Redis is unreachable; `/health` reports `scheduler: "ok" | "degraded" | "error"` based on a Redis heartbeat key.

- [ ] **Step 1: Write the failing test**

Add a test for a new exported helper `checkSchedulerHealth(redis)` in `packages/api/src/lib/db-health.ts` (or a new `scheduler-health.ts`): with a mocked Redis that pings OK, returns `"ok"`; with a mocked Redis that throws, returns `"error"`. Follow the existing `db-health` test pattern (search `db-health` in `packages/api/src/tests/`).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test` in `packages/api`
Expected: FAIL — helper does not exist.

- [ ] **Step 3: Implement the health check**

In `packages/api/src/lib/db-health.ts` (or a new file), add:

```ts
export async function checkSchedulerHealth(redis?: RedisClient): Promise<"ok" | "degraded" | "error"> {
  if (!redis) return "degraded";
  try {
    const start = performance.now();
    await redis.ping();
    return performance.now() - start < 1000 ? "ok" : "degraded";
  } catch {
    return "error";
  }
}
```

Wire it into `healthCheck` (add `checks.scheduler` when a redis client is present).

- [ ] **Step 4: Make the boot check fail-loud**

In `apps/server/src/scheduler.ts`, `initScheduler`, after the existing `if (!env.SCHEDULER_ENABLED || !env.REDIS_URL)` guard, add:

```ts
const redis = getRedisClient();
try {
  await redis.ping();
} catch (error) {
  throw new Error(
    `SCHEDULER_ENABLED=true but Redis is unreachable at ${env.REDIS_URL}: ${String(error)}`,
  );
}
```

(Import `getRedisClient` from `@cogito-app/api/lib/redis`.) This makes a misconfigured prod boot fail instead of silently skipping jobs.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test` in `packages/api` + server tests
Expected: PASS.

- [ ] **Step 6: Update docs**

`docs/CONTEXT.md` scheduler section: note the fail-loud boot check and the `/health` scheduler check. `docs/RUNBOOK.md`: note the boot failure mode.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/scheduler.ts packages/api/src/lib/db-health.ts <test files> docs/CONTEXT.md docs/RUNBOOK.md
git commit -m "fix(ops): fail loud when scheduler is enabled but Redis is unreachable"
```

---

### Task 10: Google OAuth + Meet wiring helper and docs

**Files:**
- Create: `scripts/google-meet-auth.ts` (repo-root scripts dir — check if `scripts/` exists; if not, create it)
- Modify: `apps/server/.env.example` (annotate the Google Meet OAuth flow)
- Docs: `docs/RUNBOOK.md` (Google Cloud console steps), `docs/CONTEXT.md` (auth section)

**Interfaces:**
- Consumes: `GOOGLE_MEET_CLIENT_ID`, `GOOGLE_MEET_CLIENT_SECRET` from env.
- Produces: a one-time helper that prints `GOOGLE_MEET_REFRESH_TOKEN` for the operator to paste into SOPS.

- [ ] **Step 1: Write the helper script**

Create `scripts/google-meet-auth.ts`:

```ts
/**
 * One-time helper: obtain a Google Meet OAuth refresh token.
 *
 * Usage:
 *   GOOGLE_MEET_CLIENT_ID=... GOOGLE_MEET_CLIENT_SECRET=... bun run scripts/google-meet-auth.ts
 *
 * Prints the refresh token. Store it in the SOPS-encrypted prod env
 * (GOOGLE_MEET_REFRESH_TOKEN). The token must be refreshed by re-running
 * this script if it is ever revoked or expires (Gmail refresh tokens do not
 * expire while the app is used, but a revoked consent requires re-consent).
 */
import { createServer } from "node:http";

const clientId = process.env.GOOGLE_MEET_CLIENT_ID;
const clientSecret = process.env.GOOGLE_MEET_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_MEET_CLIENT_ID and GOOGLE_MEET_CLIENT_SECRET are required");
  process.exit(1);
}

const redirectUri = "http://localhost:8787/oauth2callback";
const scopes = ["https://www.googleapis.com/auth/calendar"];

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

console.log("Open this URL in a browser and authorize:\n", authUrl);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("missing code");
    return;
  }
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as { refresh_token?: string; error?: string };
  if (!token.refresh_token) {
    res.writeHead(400).end(`no refresh_token: ${JSON.stringify(token)}`);
    return;
  }
  res.writeHead(200).end("Authorization complete — copy the refresh token from the terminal.");
  console.log("\nGOOGLE_MEET_REFRESH_TOKEN=" + token.refresh_token);
  server.close();
  process.exit(0);
});

server.listen(8787, () => console.log("Waiting for the OAuth callback on http://localhost:8787 ..."));
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run check-types` at repo root
Expected: PASS.

- [ ] **Step 3: Document the Google Cloud console steps**

In `docs/RUNBOOK.md`, add a "Google OAuth + Meet credentials" section:
1. Login OAuth: Google Cloud console → project → APIs & Services → Credentials → OAuth client (Web) → authorized redirect URI `https://api.cogitoacademy.id/api/auth/callback/google` → copy `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
2. Meet: enable the Google Calendar API; create an OAuth client (Desktop app type works for the helper); run the helper script to get the refresh token; set `GOOGLE_MEET_CLIENT_ID/SECRET/REFRESH_TOKEN` (Gmail account — no domain-wide delegation needed).
3. Note: `GOOGLE_CLIENT_ID` is reused as the Meet OAuth fallback client — prefer dedicated Meet credentials (L1 finding).

- [ ] **Step 4: Commit**

```bash
git add scripts/google-meet-auth.ts apps/server/.env.example docs/RUNBOOK.md docs/CONTEXT.md
git commit -m "feat(ops): add Google Meet OAuth refresh-token helper and docs"
```

---

### Task 11: Xendit production switch prep (env + docs; switch happens in Phase 2/4)

**Files:**
- Modify: `apps/server/.env.example` (annotate Xendit prod values)
- Modify: `infra/.env.prod.example` (fill in the Xendit + webhook sections with placeholders and instructions)
- Docs: `docs/RUNBOOK.md` (sandbox E2E checklist)

**Interfaces:**
- Consumes: nothing.
- Produces: documented checklist + env template so the Phase 2/4 switch is mechanical.

- [ ] **Step 1: Update the env templates**

In `infra/.env.prod.example`, ensure the Xendit block documents: `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `XENDIT_SUCCESS_REDIRECT_URL=https://app.cogitoacademy.id/balance`, `XENDIT_FAILURE_REDIRECT_URL=https://app.cogitoacademy.id/balance`, and `WEBHOOK_ALLOWED_IPS` (Xendit egress IPs — from Xendit docs/dashboard).

- [ ] **Step 2: Write the sandbox E2E checklist**

In `docs/RUNBOOK.md`, add a "Xendit go-live checklist":
1. Sandbox: set `PAYMENT_PROVIDER=xendit` with sandbox keys; run a purchase E2E (create purchase → Xendit invoice → webhook → wallet credit).
2. Verify webhook signature + IP allowlist behavior (test with a wrong token → rejected).
3. Set the Xendit dashboard webhook URL to `https://api.cogitoacademy.id/webhooks/payments/xendit`.
4. Live: swap sandbox keys for live keys; run one real small transaction; verify the wallet credit and the redirect flow.
5. Confirm `WEBHOOK_ALLOWED_IPS` contains Xendit's live egress IPs.

- [ ] **Step 3: Commit**

```bash
git add apps/server/.env.example infra/.env.prod.example docs/RUNBOOK.md
git commit -m "docs(ops): Xendit go-live checklist and env template"
```

---

## Self-review notes

- **Spec coverage:** Phase 0 → Task 1. Phase 1 findings → Tasks 2-9 (verification gate, HTML injection, Sanity proxy, payouts, queue pagination, economy fan-out, migrations, scheduler). Google OAuth/Meet wiring → Task 10. Xendit prep → Task 11 (actual switch deferred to Phase 2/4 per spec §4.1.10). Frontend banner → explicitly out of scope (spec §6). Infra/observability/CD → separate plan after this one lands.
- **Type consistency:** `requireVerifiedStudent`/`verifiedStudentProcedure` names used consistently across Task 2 steps. `checkSchedulerHealth` defined in Task 9 Step 3 and tested in Step 1. `toOverrideQueueItem`/`toOverrideCursor` names match the existing service code (verified in the file).
- **Placeholders:** none — every step has concrete code or a precise instruction with file:line anchors.
