# Plans Index

Active plans live in `docs/plans/active/`. Completed one-shot plan documents
are deleted when their work merges (policy set 2026-10-09) — the merge PR, its
commit message, and the dated entries in `docs/CONTEXT.md` are the permanent
record; plan-file archives are not maintained.

## Active

| Plan                                                                          | Branch                           | Status                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DEFERRED-OPS-TASKS.md](active/DEFERRED-OPS-TASKS.md)                         | main (post-merge)                | Code gaps 1.1–1.8 done; §2 Redis sessions done (R1, 2026-09-05); §3 EXPLAIN/smoke executed, p95 post-deploy; §4 ops pending                                                                                                                                                                                           |
| [DEPLOYMENT-PLAN.md](active/DEPLOYMENT-PLAN.md)                               | main (merged #115–#118)          | **APPLIED + VERIFIED 2026-09-01** — infra applied 08-31; CD green end-to-end (sha-verified), Phase 2 env wiring operator-confirmed, ACL pasted; Phase 4 closed 2026-09-05 (Kuma wired, rotation verified, PLG declared). Remaining: Phase 5 drills (next operator session), payment-provider Live Mode E2E (Midtrans) |
| [ROLE-BASED-DASHBOARD-ANALYTICS.md](active/ROLE-BASED-DASHBOARD-ANALYTICS.md) | working tree                     | **In progress (2026-09-25)** — server booking facets, role dashboard insights, wallet readiness, admin queue pulse, and metric semantics landed; payout/capacity/payment/funnel/supply/SLA aggregates remain                                                                                                          |
| [PAYMENT-INTEGRITY-FLAP.md](active/PAYMENT-INTEGRITY-FLAP.md)                 | fix/payment-integrity-root-cause | **In progress (2026-10-01)** — wave 1 merged (alert `for 5m` + `[30m]`); wave 2 fixes root cause (fee-aware money-gated checks, 7d reconcile bound, `max()`, manual disposition of 2 stuck rows); remaining: counter persistence, vault CRLF, reconcile-failure logging                                               |

Also see [`docs/MIDTRANS-MIGRATION.md`](../MIDTRANS-MIGRATION.md) — the active
production payment-provider guide.
