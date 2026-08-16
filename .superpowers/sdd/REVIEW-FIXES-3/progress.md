# REVIEW-FIXES-3 — SDD Progress Ledger

Wave-3 audit execution. Worktree: `/Users/miapalovaara/cogito/wt-review-fixes3`.
Baseline: API 1747 pass / 0 fail, server 44 pass / 0 fail; api coverage 98.2%, overall 98.0%.

## Status

| PR  | Tasks                                   | Status        | Notes |
| --- | --------------------------------------- | ------------- | ----- |
| P1  | Docs reconciliation (D1–D4)             | MERGED (#60)  | Main body landed in #59; follow-up closed CONTEXT gaps. Squash-merged. |
| P2  | PR #55 blocker report (report only)     | MERGED (#61)  | Comment posted: https://github.com/cogitoacademy/app/pull/55#issuecomment-5306378534 |
| P3  | Backend money-correctness B1–B9 (TDD)   | MERGED (#62)  | 9 commits, 1782/44 pass at merge time; API 98.1%, overall 98.0% |
| P4  | CI/CD hardening C1–C9                   | MERGED (#63)  | Labeler v7 + labels + backfill, CD fail-loudly, .dockerignore, non-root Dockerfiles (verified locally), stop_grace_period, lint auto-commit guard, redis quit + force-exit, ci.yml hygiene |
| P5  | U1, U5, U10, U14 + hygiene (5.8)        | PR #64 open   | 5 commits; full suite 1782+44 pass; API 97.7%, overall 97.6% |
| P5  | U2, U6, U7                              | pending       | Student self-reschedule, admin per-session cancel, per-session tutor reschedule — feature-scale, next wave |
| P6  | Frontend F-items + auth                 | blocked       | Requires PR #55 merge (open, red CI — blocker report posted) |

## Per-PR report (plan requirement)

| PR | Merge commit | Tests | Coverage deltas | PR URL | CI |
| -- | ------------ | ----- | --------------- | ------ | -- |
| P1 | `7674dcb` | docs-only (no test impact; full suite verified locally) | — | #60 | green (duplicate run pending approval; earlier run green) |
| P2 | `44fd088` | docs-only | — | #61 | green |
| P3 | `648d7ca` | 1769 API + 44 server (then 1782 after P5 test updates) | API 98.2→98.1, overall 98.0 | #62 | green |
| P4 | `266978a` | 44 server; Dockerfiles built+run non-root locally | — | #63 | green |
| P5 | open (#64) | 1782 API + 44 server | API 98.1→97.7, overall 98.0→97.6 (new feature code) | #64 | running |

## Key decisions recorded

- U12 (P3.1): DL-25 decision (b) — `deadlineAt = min(now + 12h, scheduledStartAt)`; room assign bumps to `scheduledEndAt + 2h`.
- B6 (P3.6): migration numbered 0019 on main (PR #55's 0019–0021 not merged).
- U10 (P5): migration 0020 on main; legacy `category` values in tests mapped to enum.
- P5 remaining: U2 (rescheduleSelf needs state-machine/product decision), U6, U7.
- P6: blocked on PR #55 (TS6133 + migration 0020 mismatch — reported).

## Commit log (P5 branch)

- `d91cadd` chore(booking): explicit column lists; drop unused BookingTransition (5.8)
- `2041d48` feat(achievement): PRD field parity — issuer, visibility, category enum (U10)
- `dc17b2e` feat(admin): manual meeting-link entry with participant notification (U1)
- `a3bc6ce` feat(booking,room): offline room availability integrated into booking creation (U14)
- `3eb9883` feat(tutor): per-participant no-show marking with hold forfeit (U5)
- `7931e8d` docs: record wave-3 P5 statuses
- `c980b98` test(achievement): use PRD category enum values in legacy tests
