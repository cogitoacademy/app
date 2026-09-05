# Observability + Stability Wave — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship traceable logs, a tailnet-only PLG monitoring stack, Redis-backed sessions, upload hardening, and zero stuck-active plans — with no behavior change except the listed hardening.

**Architecture:** TraceId via AsyncLocalStorage (W3C `traceparent`-compatible) through requests, BullMQ jobs, and dispatch/webhook records into Loki; Prometheus scrapes a rewritten exposition `/metrics`; Alloy + node_exporter + cAdvisor feed Loki/Prometheus under Grafana; Ansible declares all of it; sessions move to Better Auth secondary storage (DB-backed); uploads get per-flow allowlists + magic-byte sniffing.

**Tech Stack:** Bun 1.4, Elysia, oRPC, BullMQ 6 + ioredis 6, Better Auth 1.6.11, Drizzle + PostgreSQL 16, Loki + Prometheus + Grafana + Alloy + node_exporter + cAdvisor (Coolify services), Ansible (control-node driven), SOPS + Age vault.

## Global Constraints

- Conventional Commits (`type(scope): description` + why/what body); PRs only, squash-merge; branches cut from `origin/main` after `git fetch`.
- 100% line coverage gate for `packages/api` and overall (`.github/scripts/coverage-comment.ts`); every behavior change ships tests first (TDD); trivial methods use class-field arrow functions to dodge the Bun lcov misattribution quirk.
- `bun run check` (oxlint 1.80.0 + oxfmt 0.65.0), `bun run check-types`, `bun run test:coverage`, `bun run build` green before push.
- Logs carry `userId`, never email (enforced in `logger.ts` allowlist + `beforeSend`-style scrub in any new emitter).
- AGENTS.md rule 11: every behavior-changing PR updates `docs/CONTEXT.md`, `docs/RUNBOOK.md`, `docs/API-REFERENCE.md` / `docs/MODULE-REFERENCE.md` as affected, and this plan's status — in the same PR.
- Workers run in isolated worktrees (`~/cogito/wt-*`), never share a working directory; file sets below are disjoint per task.
- Secrets never enter git or chat: vault via `sops`, Bearer tokens via env; the lead never reads the Age key.

## File map (what each piece owns)

- `packages/api/src/lib/trace.ts` (new) — trace scope: `runWithTrace()`, `getTraceId()`, W3C `traceparent` parse/emit helpers.
- `packages/api/src/lib/logger.ts` — allowlist `traceId` on `LogEntry`; drop any `email` key if ever passed.
- `apps/server/src/routes/middlewares.ts` — seed trace scope per request (incoming `traceparent` or `x-request-id` or generated `req_*`).
- `packages/api/src/modules/scheduler/*` + `scheduler.service.ts` — stamp `{ traceId, userId }` into BullMQ job data; log both on start/complete/fail.
- `packages/api/src/modules/notification/*` + `apps/server/src/webhooks/payments.ts` — persist traceId on dispatch rows + idempotency records; include in `rpc_error`/`request_error` logs.
- `packages/api/src/lib/metrics.ts` + `apps/server/src/routes/health-metrics.ts` — Prometheus exposition renderer (counters + duration histogram + `dlq_fresh_depth` + `breaker_state`), Bearer-gated.
- `infra/ansible/observability.yml` (new) + `infra/ansible/tasks/*` + `infra/grafana/provisioning/**` + `infra/prometheus/prometheus.yml` + `infra/loki/loki-config.yml` + `infra/alloy/config.alloy` — the whole stack declarative.
- `packages/auth/src/index.ts` + new `packages/auth/src/secondary-storage.ts` — Redis secondary storage (DB-backed).
- `packages/api/src/modules/upload/upload.types.ts` + `upload.service.ts` + `apps/server/src/routes/upload-routes.ts` — per-flow allowlists + magic-byte sniff.
- `packages/api/src/lib/circuit-breaker.ts` call sites (email/meeting providers) — breaker names.
- `infra/disk-watchdog.sh`, `infra/backup.sh`, `infra/ops.sh` — heartbeat line, backup self-check Discord, `trace` helper.
- `docs/**` + `docs/plans/**` — every D-item fix and plan move.

### Task 1: Docs sync + plan closes + CI-truth verify (D1–D7, C1, LINT-5)

**Files:**

- Modify: `infra/.env.prod.example`, `infra/coolify-setup.md`, `packages/env/src/web.ts`, `apps/web/src/lib/resolve-server-url.ts`, `docs/plans/active/DEFERRED-OPS-TASKS.md`, `infra/monitoring.md`, `infra/APPLY-RUNBOOK.md`, `docs/INFRA-ARCHITECTURE-DEEP-DIVE.md`, `docs/CONTEXT.md`, `apps/web/public/tweaks-bar.js`
- Move: 7 plans `active/` → `completed/`; Modify: `docs/plans/README.md`, `docs/plans/active/DEPLOYMENT-PLAN.md`

**Interfaces:**

- Consumes: design doc §G + master index (this plan's source of truth for IDs).
- Produces: clean `active/` (only `DEPLOYMENT-PLAN.md` + this wave), updated index, no `Caddy` outside the intentional Traefik sentence.

- [ ] **Step 1: Copy the Midtrans block into `infra/.env.prod.example` (D1)**

Mirror `infra/secrets/prod.env.example` lines 83–94 (commented `MIDTRANS_MODE/SERVER_KEY/CLIENT_KEY/MERCHANT_ID/WEBHOOK_SIGNATURE_KEY` + cutover pointer). Then:

Run: `diff <(grep -c MIDTRANS infra/secrets/prod.env.example) <(grep -c MIDTRANS infra/.env.prod.example)`
Expected: counts equal (both non-zero).

- [ ] **Step 2: Traefik wording (D2) + DNS strings (D5)**

`s/Caddy/Traefik/` in `infra/coolify-setup.md` (5 sites), `packages/env/src/web.ts:8`, `apps/web/src/lib/resolve-server-url.ts:6`. In `infra/APPLY-RUNBOOK.md:108` and `docs/INFRA-ARCHITECTURE-DEEP-DIVE.md:95`, `coolify.` → `cl.` for the webhook host.

Run: `rg -in "caddy" infra/coolify-setup.md packages/env/src/web.ts apps/web/src/lib/resolve-server-url.ts; rg -n "coolify\.cogitoacademy" infra/APPLY-RUNBOOK.md docs/INFRA-ARCHITECTURE-DEEP-DIVE.md`
Expected: no output (the one intentional "not Caddy" sentence in DEPLOYMENT.md stays).

- [ ] **Step 3: Honest boxes (D3, D4)**

`DEFERRED-OPS-TASKS.md` §4.3: check log-rotation + Kuma-deploy/monitor/status-page boxes with "(live since 2026-09-01/02)" notes. Rewrite `infra/monitoring.md` (or delete it if KUMA-RUNBOOK + INFRA-PLAYBOOK cover everything — prefer rewrite to a 10-line pointer file so no link rots).

- [ ] **Step 4: tweaks-bar addEventListener (LINT-5)**

```js
// before
el.onchange = fn;
// after
el.addEventListener("change", fn);
```

Apply to the 11 `onX =` sites in `apps/web/public/tweaks-bar.js`, then:

Run: `bunx oxlint@1.80.0 apps/web/public/tweaks-bar.js`
Expected: zero `prefer-add-event-listener` warnings.

- [ ] **Step 5: Close 7 plans + fix index (D6)**

`git mv docs/plans/active/{FRONTEND-GAPS-SPEC,DEPLOYMENT-WAVE-2,INFRA-AUTOMATION,MONITORING-ALERTING}.md docs/plans/completed/` (CI-SANITY, LINT-DEPRECATION-HYGIENE, REFACTOR-PR move when their tasks 5/8 land — same wave, later PRs). Remove the duplicate index rows; update CI-SANITY branch cell to `main`.

Run: `ls docs/plans/active/`
Expected: only `DEPLOYMENT-PLAN.md`, `DEFERRED-OPS-TASKS.md`, `OBSERVABILITY-STABILITY-WAVE.md` (+ CI-SANITY/LINT/REFACTOR-PR until their closing PRs).

- [ ] **Step 6: CI-truth verify (C1, operator-assisted, no code)**

From a write-collaborator account confirm `main-1`/`main-2` rulesets require `semantic-pr` (post-#190 rename) + strict "branches up to date"; record the `ACTIONS_BOT_PAT` keep-or-drop decision in CI-SANITY's log. If a check name drifted, update the ruleset (console) — never rename code to match.

- [ ] **Step 7: Commit**

```bash
git add infra/.env.prod.example infra/coolify-setup.md packages/env/src/web.ts apps/web/src/lib/resolve-server-url.ts docs infra/APPLY-RUNBOOK.md apps/web/public/tweaks-bar.js docs/plans
git commit -m "docs(plans): sync stale references and close completed waves

D1-D6, LINT-5. No behavior change."
```

### Task 2: traceId end-to-end (T1)

**Files:**

- Create: `packages/api/src/lib/trace.ts`, `packages/api/src/tests/unit/trace.test.ts`
- Modify: `packages/api/src/lib/logger.ts`, `apps/server/src/routes/middlewares.ts`, `packages/api/src/modules/scheduler/scheduler.service.ts`, `packages/api/src/modules/notification/notification.service.ts`, `apps/server/src/webhooks/payments.ts`
- Test: `packages/api/src/tests/unit/logger-trace.test.ts`

**Interfaces:**

- Consumes: existing `requestUserId` WeakMap pattern, `generateRequestId()`.
- Produces: `runWithTrace({traceId,userId}, fn)`, `getTrace()`, `parseTraceparent()`, `emitTraceparent()` — later tasks import only these names.

- [ ] **Step 1: Failing test for scope + W3C round-trip**

```ts
import { describe, expect, test } from "bun:test";
import {
  emitTraceparent,
  parseTraceparent,
  runWithTrace,
  getTrace,
} from "../../lib/trace";
describe("trace", () => {
  test("round-trips W3C traceparent", () => {
    const header = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    expect(emitTraceparent(parseTraceparent(header)!)).toBe(header);
  });
  test("scope survives await", async () => {
    await runWithTrace({ traceId: "req_abc", userId: "u1" }, async () => {
      await Bun.sleep(1);
      expect(getTrace()).toEqual({ traceId: "req_abc", userId: "u1" });
    });
  });
});
```

Run: `bun test packages/api/src/tests/unit/trace.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 2: Minimal `trace.ts` (AsyncLocalStorage + W3C)**

```ts
import { AsyncLocalStorage } from "node:async_hooks";
export interface TraceCtx {
  traceId: string;
  userId?: string;
}
const als = new AsyncLocalStorage<TraceCtx>();
export function runWithTrace<T>(ctx: TraceCtx, fn: () => T): T {
  return als.run(ctx, fn);
}
export const getTrace = (): TraceCtx | undefined => als.getStore();
export function parseTraceparent(h: string) {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(h.trim());
  return m ? { traceId: m[1], spanId: m[2], flags: m[3] } : null;
}
export function emitTraceparent(t: {
  traceId: string;
  spanId: string;
  flags: string;
}) {
  return `00-${t.traceId}-${t.spanId}-${t.flags}`;
}
```

Run: same test. Expected: PASS.

- [ ] **Step 3: Logger allowlist + middleware seeding**

`logger.ts`: add `traceId?: string` to `LogEntry`; delete any `email` key before serializing. `middlewares.ts` derive: `traceparent` header → `traceId`, else `x-request-id`, else `generateRequestId()`; wrap handler in `runWithTrace`. `request_complete`/`request_error` include `getTrace()`.

- [ ] **Step 4: Jobs + dispatch + webhooks carry traceId**

Stamp `{ traceId, userId }` into all 6 `schedule*` job-data payloads; log both on start/complete/fail; persist on `notification_dispatch` metadata + webhook idempotency records. Tests: scheduler service test asserts job data contains traceId; webhook test asserts idempotency record round-trips it.

- [ ] **Step 5: Full gate + commit**

Run: `bun run check && bun run check-types && bun run test:coverage && bun run build`
Expected: green, 100% lines.

```bash
git add packages/api/src/lib/trace.ts packages/api/src/lib/logger.ts apps/server/src/routes/middlewares.ts packages/api/src/modules/scheduler packages/api/src/modules/notification apps/server/src/webhooks packages/api/src/tests/unit/trace.test.ts packages/api/src/tests/unit/logger-trace.test.ts docs
git commit -m "feat(api): propagate W3C-compatible traceId end to end

T1. request_complete, jobs, dispatch, webhooks correlate in Loki."
```

### Task 3: Prometheus exposition `/metrics` (P1, L2/A5)

**Files:**

- Modify: `packages/api/src/lib/metrics.ts`, `apps/server/src/routes/health-metrics.ts`
- Test: `packages/api/src/tests/unit/metrics-exposition.test.ts`

**Interfaces:**

- Consumes: `recordRequest()` call sites (unchanged), `checkDlqHealth`, `checkCircuitBreakers`.
- Produces: exposition text at `GET /metrics` (Bearer `METRICS_TOKEN`); JSON shape removed (docs updated same PR).

- [ ] **Step 1: Failing exposition test**

```ts
import { describe, expect, test } from "bun:test";
import { renderExposition } from "../../lib/metrics";
describe("metrics exposition", () => {
  test("emits HELP/TYPE + request counter", () => {
    const out = renderExposition();
    expect(out).toContain("# HELP http_requests_total");
    expect(out).toContain("# TYPE http_requests_total counter");
  });
});
```

Run: `bun test packages/api/src/tests/unit/metrics-exposition.test.ts`
Expected: FAIL (`renderExposition` missing).

- [ ] **Step 2: Renderer (counters + duration histogram + dlq/breaker gauges)**

Emit `http_requests_total{path,method,status}`, `http_request_duration_ms_bucket/sum/count`, `dlq_fresh_depth`, `breaker_state{name}`. Mark `instance="single"` label + code comment noting per-process semantics (multi-replica follow-up recorded, not solved).

- [ ] **Step 3: Route serves `text/plain; version=0.0.4`, Bearer unchanged**

Existing 401-on-mismatch behavior preserved; unauthenticated → 401 (scraper uses vault Bearer). Update API-REFERENCE `/metrics` section same PR.

- [ ] **Step 4: Gate + commit** (`feat(api): expose Prometheus metrics`).

### Task 4: PLG stack + swap + retention (P2/P3, A2, A3)

**Files:**

- Create: `infra/ansible/observability.yml`, `infra/prometheus/prometheus.yml`, `infra/loki/loki-config.yml`, `infra/alloy/config.alloy`, `infra/grafana/provisioning/datasources/loki-prom.yml`, `infra/grafana/provisioning/dashboards/*.json` (app-red, logs-traces, infra, delivery)
- Modify: `infra/ansible/coolify-resources.yml` (service declarations only if API-expressible; else UI-fallback note like Kuma), `docs/RUNBOOK.md`, `docs/CONTEXT.md`, `infra/ops.sh` (`trace` helper)

**Interfaces:**

- Consumes: `METRICS_TOKEN` + `DISCORD_WEBHOOK_URL` from vault (never echoed); `uptime-kuma.yml` as the structural template.
- Produces: healthy `cogito-loki/prometheus/grafana/alloy`, node_exporter, cAdvisor; retention Loki 30d / Prometheus 15d (vars `LOKI_RETENTION_DAYS`, `PROM_RETENTION_DAYS`; lean fallback 30s/7d documented).

- [x] **Step 1: Playbook + configs (syntax-check only, no secrets)**

Scrape: api `/metrics` (Bearer from vault, 15s), node_exporter, cAdvisor. Alloy uses `loki.source.docker_logs` (Docker API discovery — never file globs, A3). Grafana tailnet-only, provisioned datasources + 4 dashboards as files.

Run: `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/observability.yml --syntax-check`
Expected: clean.

Status (worker `f/obs-monitor`, 2026-09-05): DONE declarative-only — `infra/ansible/observability.yml` (+ `tasks/observability-service.yml`), `infra/prometheus/prometheus.yml`, `infra/loki/loki-config.yml`, `infra/alloy/config.alloy`, `infra/grafana/provisioning/` (datasources + provider + 4 dashboards). Syntax-check clean, YAML/JSON parse clean. No secrets in git (vault keys by name only). No live apply.

- [ ] **Step 2: Apply on operator machine (tunnel up) + verify**

`ansible-playbook ... observability.yml`; verify: Grafana tailnet login, LogQL `{service="cogito-app-server"} |= "traceId"`, Prometheus targets UP, Loki 30d / Prometheus 15d retention flags, Discord test alert arrives.

Status (worker `f/obs-monitor`, 2026-09-05): NOT STARTED — operator-owned (workers never SSH/apply). Exact commands are in `WORKER-REPORT.md` (OPERATOR-APPLY checklist) when this branch lands.

- [x] **Step 3: Swap + limits + ops helper + commit**

2G swap + Coolify memory limits (API 512M, Loki 300M, Prometheus 256M, Grafana 256M). `ops.sh trace <traceId>` prints the Grafana explore URL (no SSH log-grepping needed).

Status (worker `f/obs-monitor`, 2026-09-05): DONE declarative-only — swap + limits documented in RUNBOOK (operator applies, never a worker); `ops.sh trace` added (`bash -n` clean, exercised locally); `bun run check` green.

2G swap + Coolify memory limits (API 512M, Loki 300M, Prometheus 256M, Grafana 256M). `ops.sh trace <traceId>` prints the Grafana explore URL (no SSH log-grepping needed).

```bash
git add infra/ansible/observability.yml infra/prometheus infra/loki infra/alloy infra/grafana infra/ops.sh docs
git commit -m "feat(infra): tailnet-only Loki+Prometheus+Grafana observability stack

P2/P3, A2/A3. Retention Loki 30d, Prometheus 15d; 2G swap + limits."
```

### Task 5: Redis secondary storage (R1)

**Files:**

- Create: `packages/auth/src/secondary-storage.ts`, `packages/auth/src/secondary-storage.test.ts`
- Modify: `packages/auth/src/index.ts`, `packages/auth/package.json` (only if `@better-auth/redis-storage` chosen over the hand adapter — prefer hand adapter over existing `RedisClient` to avoid a second client)
- Test: login→cache-hit→revoke→denied integration path

**Interfaces:**

- Consumes: `getRedisClient()` (`RedisClient`).
- Produces: `createSecondaryStorage(redis): SecondaryStorage` with `get/set/delete` + key prefix `better-auth:`.

- [ ] **Step 1: Failing adapter test (hit/miss/TTL/delete)**

```ts
test("get returns null on miss, value on hit, null after delete", async () => {
  const s = createSecondaryStorage(new InMemoryRedis());
  expect(await s.get("k")).toBeNull();
  await s.set("k", "v", 60);
  expect(await s.get("k")).toBe("v");
  await s.delete("k");
  expect(await s.get("k")).toBeNull();
});
```

- [ ] **Step 2: Adapter + wiring (`storeSessionInDatabase: true`, 7d expiry, cookieCache untouched)**

Redis failures fall back to DB read (log `warn`, never 500 a login). `revokeSessionsOnPasswordReset` deletes both stores — assert in test.

- [ ] **Step 3: Gate + commit** (`feat(auth): cache sessions in Redis with DB fallback`); remove §2 from DEFERRED-OPS same PR.

### Task 6: Upload hardening (U1, U2, U3)

**Files:**

- Modify: `packages/api/src/modules/upload/upload.types.ts`, `upload.service.ts`, `apps/server/src/routes/upload-routes.ts`, `packages/api/src/lib/request-id.ts` (magic sniff helper)
- Test: `packages/api/src/tests/unit/upload.*.test.ts`

**Interfaces:**

- Consumes: `createUploadUrlInput`, `readBodyWithLimit`.
- Produces: `ALLOWED_IMAGE_TYPES` (photo flows), `createUploadUrl` accepts purpose-scoped allowlist; `sniffImageKind()` helper.

- [ ] **Step 1: Failing tests (PDF rejected on photo flow; PNG-bytes-as-jpeg accepted; HTML-bytes-as-png rejected)**

```ts
test("photo flow rejects application/pdf", () => {
  expect(() =>
    createUploadUrlInput.parse({
      filename: "a.pdf",
      contentType: "application/pdf",
      contentLength: 10,
    }),
  ).toThrow();
});
```

(PDF moves to an unreferenced `ALLOWED_DOCUMENT_TYPES` export until a flow needs it.)

- [ ] **Step 2: Split allowlists + magic-byte sniff (PNG/JPEG/WebP/GIF signatures, mismatch → 415)**

Local POST sniffs before `Bun.write`; R2 flow gains a nightly audit script (`infra/r2-upload-audit.sh`, HEAD ContentType vs key class, Discord on mismatch — U3 CORS verified app-origin-only in the same step and recorded).

- [ ] **Step 3: Gate + commit** (`fix(api): scope upload types per flow and verify magic bytes`).

### Task 7: Stability remainder (M1, M2, M3, M4, A1, A4, A6, L3, L4)

**Files:**

- Modify: `packages/api/src/modules/email/resend-email.provider.ts`, `packages/api/src/modules/meeting/google-meeting.provider.ts`, `infra/disk-watchdog.sh`, `infra/backup.sh`, `scripts/migrate-and-deploy.sh`, `docs/FAILURES.md`, `docs/RUNBOOK.md`, `docs/CONTEXT.md`, `docs/KUMA-RUNBOOK.md`
- Tests: breaker unit tests asserting distinct keys.

- [ ] **Step 1: Named breakers (M1)**

```ts
new CircuitBreaker({
  name: "resend",
  failureThreshold: 3,
  resetTimeoutMs: 120_000 /* ... */,
});
new CircuitBreaker({
  name: "google-meet",
  failureThreshold: 5,
  resetTimeoutMs: 60_000 /* ... */,
});
```

Test asserts Redis keys `cogito:cb:resend` ≠ `cogito:cb:google-meet`. Gate + commit (`fix(api): isolate email and Meet circuit breakers`).

- [ ] **Step 2: Operator-visible fixes (M2 DLQ, M3 watchdog heartbeat, M4 Sentry-dormant, A1 DB-host, A4 rollback truth, A6 RPO, L3 gateway, L4 certs, O1 OTel-deferral record)**

`./infra/ops.sh dlq-clear` once + weekly note in RUNBOOK; watchdog heartbeat line (`disk_pct=X verdict=ok|warn|pruned`); Sentry recorded dormant in CONTEXT + env example comment; OTel-deferral rationale (O1) recorded in CONTEXT alongside it; backup preflight (abort loudly pre-snapshot on unresolvable host) + self-check Discord on dump/upload failure; DB-host docs reconciled to dynamic resolution (D7 with A1); rollback perms verified or manual-only recorded; RPO-24h accept + WAL path in RUNBOOK; gateway container removed/fixed; `api-cert`/`app-cert` Kuma monitors (console, recorded in KUMA-RUNBOOK).

- [ ] **Step 3: Gate + commit** (`fix(infra): stability remainder — breakers, dlq, watchdog, backup, certs`).

### Task 8: Booking tidy + closes (L1, plan moves)

**Files:**

- Modify: one `booking.*.ts` cluster extraction ONLY (mechanical move, re-exported; suite-as-contract), `docs/plans/README.md`, moved plans.
- Rule: no logic edits; if the diff shows anything but moves + import updates, split smaller.

- [ ] **Step 1: Extract one cohesive cluster (e.g. withdraw/reprice helpers) + full gate green.**
- [ ] **Step 2: Move CI-SANITY/LINT/REFACTOR-PR to `completed/`, shrink DEFERRED-OPS (§2 done, §3 executed: EXPLAIN ANALYZE top-5 + p95 baseline recorded), reduce DEPLOYMENT-PLAN to drills + Xendit Live.**
- [ ] **Step 3: Commit** (`refactor(api): extract booking withdraw cluster + close waves` + `docs(plans): close completed waves`).

## Ordering & parallelism

Tasks 1–3 parallel-safe (disjoint files). Task 4 after 2–3 (dashboards query the new fields). Task 5 independent (own worktree). Task 6 independent. Task 7 breaker fix with 2; operator steps anytime. Task 8 last (touches booking + indexes).

## Verification (per task, not just at the end)

`bun run check && bun run check-types && bun run test:coverage && bun run build`; live: Grafana LogQL trace search without SSH, Prometheus targets UP, login→revoke→denied on staging-equivalent, LogQL shows zero-email invariant (`|= "email"` only in scrubbed contexts), `/health` sha-verified after each deploy.
