# SDD ledger — plan: docs/plans/active/BACKEND-HARDENING.md

Scope per user decision: BACKEND-HARDENING (PRs A–E) + PRD-GAPS G1–G18 (backend features). PRD-GAPS execution is tracked in its own ledger section (G1–G18).

## Setup

- Docs pushed to main at 9e20f2a (docs(plans): add backend hardening plan).
- User approved executing A–E + G1–G18 backend, backend-only.
- Baseline main: 9e20f2a
- Branch strategy per PR, each opened as a GitHub PR against main (existing PR structure: improvement/_, fix/_, etc.).

## Task log

## PR A (improvement/ci-deps-bot)

- Implementer: 82a864c, 28be5ab, e257a82 (A1 dependabot bun, A2 auto-merge gate, A3 docker pin, A4 verify-only no-op, A5 branch cleanup).
- Task review: Approved. One Important (remote foundation-critical-fixes branch leftover) — resolved by controller via `git push origin --delete improvement/foundation-critical-fixes`; verified clean.
- PR A: complete (commits 9e20f2a..e257a82, review clean).

## PR B (improvement/local-test-parity)

- Implementer: aa4e2e9, eda8ea8 (B1 DB URL reconcile — .env local-only since gitignored; B2 docker-compose.test.yml + db:test root/turbo wiring).
- Task review: Approved. One Important (end-to-end unverified) — RESOLVED by controller: started colima, reset local DB schema, `bunx drizzle-kit migrate` applied, `booking-solo.test.ts` 10/10 pass against localhost:6767.
- PR B: complete (commits 9e20f2a..eda8ea8, review clean + verified).

## PR C (improvement/backend-correctness)

- Implementers: cb37c2f (C1 scheduler boot), 41483f8 (C2 rate-limit path), 5c04351 (C3 booking columns), 060bf89 (C4 JSDoc), 7d6c81b (C5 webhook allowlist), ad03a80 (C6 dead code), 607b8c2 (C7 G19 pricing).
- Task review (whole-PR): Approved. Zero Critical/Important. Minor deferred: C2 test is source-text based (per plan), WEBHOOK_ALLOWED_IPS not in .env.example, ipAllowed x-forwarded-for spoof note, fractional price floor, pre-existing redis_init_failed under bun.
- Note: controller accidentally popped an unrelated old stash (refactor/wave3-cleanup) during a `git stash pop`; recovered via `git reset --hard HEAD` + temp-worktree attribution confirmed the 13 integration failures are PRE-EXISTING test pollution (db-health.test mock.module leaks), not PR-C caused.
- PR C: complete (commits 9e20f2a..607b8c2, review clean).

## PR E (docs/plan-sync)

- Implementer: 5671c53 (PRD-GAPS-SPEC sync + G20), 89d3388 (CONTEXT + DEFERRED-OPS sync).
- Task review: Approved. Minors: line anchor drift (admin-booking.repo 30-32 not 31-33), merge-order caveat (docs reference PR C state), "~25 vs ~31 days" summary line.
- PR E: complete (commits 9e20f2a..89d3388, review clean). Note: accuracy depends on PR C merging first.

## PR D (test/backend-realignment)

- Implementers: 22c64ff+f0244c7 (D1 real-DB repo tests), 947fe80 (D2 real-Redis), ee84baa (D3 scheduler), 13d2b74 (D4 integration breadth).
- Production bugs surfaced by the tests AND fixed: bfefd76 (N1 system actorId FK — expireBookings never worked), 11d1f0a (N3 participant heldAmount stale), 38bb482 (ioredis was never a declared runtime dep — Redis silently in-memory in prod), a7e6c75 (process-wide mock.module pollution broke full suite; db.test duplicate removed, db-health DI, google-meeting schema mock removed).
- e3f3f78: bun.lock sync for ioredis dep.
- Task review: Approved. Important fixed: bun.lock now in sync. Follow-ups tracked: expiry notification (PRD gap), applyOverride stale holdAmount return, scheduler/D4 shared-state ordering.
- Result: full suite 1346 pass / 0 fail with Redis (was 13-20 failures on main). This directly resolves concern #4 (mock-too-much → real tests + real bugs found).
- PR D: complete (commits 9e20f2a..e3f3f78, review clean).

## PRD-GAPS Phase 1 (feat/prd-gaps-support-lateness) — G1, G2, G3

- Implementer: 6565786 (G1 support module), 6387cfc (G2 expiry notification), 04cace4 (G3 lateness job). Rebased onto test/backend-realignment (PR D), dropped duplicate pollution commit 55eb589.
- Review round 1: Needs fixes. Critical findings: G3 auto-cancelled everything (no attendance-present marking existed); G1 tutor self-report; 4 minors.
- Fix round (1/5): 1e295e5 + follow-up commits — markAttendance tutorProcedure RPC + upsert tutor participant (role CHECK widened via migration 0014), job gated to online modality, acceptance test via RPC; G1 proposer-only reporter; admin limit aligned; duplicate actorId map removed; no-show copy fixed; unused port method removed.
- Re-review: Approved. All 6 findings ADDRESSED, no new breakage. Full suite 1394 tests / 0 fail.
- Phase 1: complete (commits e3f3f78..HEAD, review clean).

## PRD-GAPS Phase 2 (feat/prd-gaps-booking) — G4, G5, G6, G7

- Implementer: 1957246 (G4 repricing), db19069 (G5 cancelSession), 03235bb (G6 reschedule), a7eaa04 (G7 notes+sanitizer), 87ba403 (oxfmt).
- Review round 1: Approved with 2 Important (group completion deducts proposer post-withdrawal; reject fallback state) + minors.
- Fix round (1/5): e871baf (per-participant group deduct + latent transitions edge awaiting_reconfirmation→awaiting_tutor_review + cancelSession terminal guard), 2845a15 (reject revert set table-derived + sanitizer double-equals bug).
- Re-review: Approved. All 3 findings ADDRESSED, no new breakage. Full suite 1455 pass / 0 fail.
- Phase 2: complete (commits 7cf4fa6..2845a15, review clean).

## PRD-GAPS Phase 3 (feat/prd-gaps-admin) — G8, G9, G10

- Implementer: 7705e8c (G8 queue urgency/SLA/filters), c4ce47a (G9 admin wallet/ledger), f15f4a7 (G10 preview), d5792d8/f061ba0 (style).
- Review round 1: Approved. Important: composite-cursor pagination untested.
- Fix round (1/5): 8893ca3 — pagination test across 3 urgency bands EXPOSED REAL BUG (raw Date in sql tuple crashed page-2+ requests); fixed with toISOString().
- Re-review: Approved. Full suite 1489 pass / 0 fail.
- Phase 3: complete (commits 2845a15..8893ca3, review clean).

## PRD-GAPS Phase 5 (feat/prd-gaps-payouts-notifications) — G15, G16, G17, G18

- Implementer: 4617e29 (G15 disclaimer tests), a04eab3 (G16 payouts), 3d3853b (G17 notification matrix), 0b80f85+9c4dece (G18 series completion).
- Review round 1: Approved. Important: G18 stale response on partial completion; Minor: wallet remainder release robustness.
- Fix round (1/5): 7a748e4 — refreshed booking row on both paths + guarded residual release.
- Re-review: Approved. Full suite 1548 pass / 0 fail.
- ALL PRD-GAPS G1-G18 COMPLETE. Phase 5: complete (commits 93d1195..7a748e4, review clean).

## Outstanding deferred concerns (tracked, not in any PR)

1. G1 ticket auto-escalation scheduler job (PRD: SLA deadline passes → escalate)
2. Meeting link not auto-updated on reschedule accept (meeting port lacks update method)
3. G17 rows unimplemented: offline room confirmed/relocated/cancelled email; payment/refund payer email; signup account-created email (modules write no notifications)
4. WEBHOOK_ALLOWED_IPS not in .env.example
5. applyOverride returns stale holdAmount in response
6. ipAllowed trusts x-forwarded-for first value (spoofable unless trusted proxy strips)
7. CONTEXT.md anchor drift (admin-booking.repo 30-32)
8. G18 group-series deducts proposer only (group-series hold accounting follow-up)
9. C2 rate-limit test is source-text based

## FINAL STATE — ALL PRs MERGED TO MAIN

- #34 ci-deps-bot → MERGED
- #35 local-test-parity → MERGED
- #36 backend-correctness → MERGED
- #37 docs/plan-sync → MERGED
- #38 test-realignment → MERGED
- #39 G1-G3 → MERGED
- #40 G4-G7 → MERGED
- #41 G8-G10 → MERGED
- #42 G11-G14 → MERGED
- #43 G15-G18 → MERGED
- All CI green on merge. Full suite on main: 1561 pass / 0 fail (local, with cogito-test DB + Redis).
- Additional fixes during merge reconciliation:
  - resetDatabase guard (main) requires test-named DB → local env/compose/.env.example now use cogito-test; local test DB migrated
  - PR #33 merged to main added listForTutor + tutorProcedure routes; merge resolutions restored these
  - wrangler.jsonc + repo/tutor files oxfmt-formatted for CI lint
- All local branches + worktrees cleaned; remote branches deleted.
