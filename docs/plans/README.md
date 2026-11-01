# Plans Index

V3 scope addition: parent/child competition CRUD is recorded as PRD S04 /
REQ-COMP-01..07 and task T00A. Complete its catalog foundation before remaining
dynamic pricing/discovery integration and activation; existing verified work is
retained. See RELEASE-V3-PRD, RELEASE-V3-SPEC and RELEASE-V3-TASKS in active/.

Active plans live in `docs/plans/active/`. Completed one-shot plan documents
are deleted when their work merges (policy set 2026-10-09) — the merge PR, its
commit message, and the dated entries in `docs/CONTEXT.md` are the permanent
record; plan-file archives are not maintained.

T10 implementation checkpoints: [public tutor API](active/T10-PUBLIC-TUTORS-API.md) and [FAQ admin/public API](active/T10-FAQ-CHECKPOINT.md).

## Active

Release v3 implementation package (2026-10-18):
[PRD](active/RELEASE-V3-PRD.md),
[technical specification](active/RELEASE-V3-SPEC.md),
[execution and acceptance plan](active/RELEASE-V3-TASKS.md).
Status: feature worktrees derive from `f/release-v3`; tested work merges there, and `main` is updated only after final acceptance. The isolated integration checkpoint combines existing fee/payout/class-draft work with the FAQ rich-text, calendar, palette and documentation changes; source worktrees remain untouched. T00A catalog CRUD/app UI, T01 rate-card pricing and active group-series repricing, and T10 public tutor/FAQ APIs and consumers are implemented. The website uses the app's current Online/Offline tutor modality; published-roster reconciliation, Activities/Other content and approved FAQ copy remain open. Read-only local migration state and the pending dev-only class-draft migration are recorded in the [runbook](../RUNBOOK.md). Runtime activation, payment/analytics acceptance, approved initial website copy, and client review remain open. Q01-Q03 and Q05-Q13 are owner-resolved; Q04 is partial; Q14-Q15, M01/M02, and client quotation acceptance remain subject to their recorded gates in TASKS.
See [code audit](../client/RELEASE-V3-AUDIT.md) and
[decision register](../client/RELEASE-V3-DECISIONS.md).
Commercial attachment: [additional-scope quotation](../client/RELEASE-V3-QUOTATION-APPENDIX.md),
fixed Rp5,500,000 commercial baseline issued for client acceptance; not yet accepted. Timeline summary and commencement
conditions are in the appendix; technical task dependencies remain in TASKS.

| Plan                                                                          | Branch                           | Status                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DEFERRED-OPS-TASKS.md](active/DEFERRED-OPS-TASKS.md)                         | main (post-merge)                | Code gaps 1.1–1.8 done; §2 Redis sessions done (R1, 2026-09-05); §3 EXPLAIN/smoke executed, p95 post-deploy; §4 ops pending                                                                                                                                                                                           |
| [DEPLOYMENT-PLAN.md](active/DEPLOYMENT-PLAN.md)                               | main (merged #115–#118)          | **APPLIED + VERIFIED 2026-09-01** — infra applied 08-31; CD green end-to-end (sha-verified), Phase 2 env wiring operator-confirmed, ACL pasted; Phase 4 closed 2026-09-05 (Kuma wired, rotation verified, PLG declared). Remaining: Phase 5 drills (next operator session), payment-provider Live Mode E2E (Midtrans) |
| [ROLE-BASED-DASHBOARD-ANALYTICS.md](active/ROLE-BASED-DASHBOARD-ANALYTICS.md) | working tree                     | **In progress (2026-09-25)** — server booking facets, role dashboard insights, wallet readiness, admin queue pulse, and metric semantics landed; payout/capacity/payment/funnel/supply/SLA aggregates remain                                                                                                          |
| [PAYMENT-INTEGRITY-FLAP.md](active/PAYMENT-INTEGRITY-FLAP.md)                 | fix/payment-integrity-root-cause | **In progress (2026-10-01)** — wave 1 merged (alert `for 5m` + `[30m]`); wave 2 fixes root cause (fee-aware money-gated checks, 7d reconcile bound, `max()`, manual disposition of 2 stuck rows); remaining: counter persistence, vault CRLF, reconcile-failure logging                                               |

Also see [`docs/MIDTRANS-MIGRATION.md`](../MIDTRANS-MIGRATION.md) — the active
production payment-provider guide.
