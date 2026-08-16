# REVIEW-FIXES-3 — SDD Progress Ledger

Wave-3 audit execution. Worktree: `/Users/miapalovaara/cogito/wt-review-fixes3`.

## Status

| PR  | Tasks                                         | Status       | Notes                                                                                                                                              |
| --- | --------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Docs reconciliation (D1–D4)                   | MERGED (#60) | Main body in #59; follow-up closed CONTEXT gaps                                                                                                    |
| P2  | PR #55 blocker report (report only)           | MERGED (#61) | Comment: pull/55#issuecomment-5306378534                                                                                                           |
| P3  | Backend money-correctness B1–B9 (TDD)         | MERGED (#62) | 9 commits; API 98.1%, overall 98.0%                                                                                                                |
| P4  | CI/CD hardening C1–C9                         | MERGED (#63) | Labeler v7+labels+backfill, CD fail-loudly, docker hardening, shutdown drains                                                                      |
| P5  | U1–U7, U10, U14 + hygiene                     | MERGED (#64) | Full suite 1803+44; API 97.6%, overall 97.5%                                                                                                       |
| P6  | F8/F13/F14/F16/C6                             | PR #65 open  | PR #55 merged (d4e50e0) unblocked P6; branch carried a main-merge reconciliation (migrations renumbered 0023, U5/U14/H-2-gate re-applied over #55) |
| P6  | G2 email verification                         | deferred     | better-auth plugin + Resend + UI (was deferred in CONTEXT before wave-3)                                                                           |
| —   | J2 session-expiry UX, F18 inviter-withdraw UI | open         | Tracked in FRONTEND-GAPS-SPEC                                                                                                                      |

## Frontend gaps (user follow-up)

- PR #55 (`feat: complete frontend PRD gap flows`) **merged 2026-08-16** (`d4e50e0`). The P2 blocker items (TS6133 `proposedEndAt`, migration 0020 achievement-column mismatch, spec deletions, stray artifacts) were resolved by the author before merge; the labeler backfill + spec note were handled in P4/P1.
- P6 landed: F16 (public `achievement.listApproved` + landing), F14 (disclaimer callout), F8 (per-session completion UI), F13 (payout details card), C6 (password policy server+client). Remaining: G2 (deferred), J2, F18-withdraw.

## Merge reconciliation (P5 branch, #55 hit main mid-P5)

- Migrations: my 0020 (achievement) → **0023_achievement_prd_fields** (0023_* renamed; #55's 0020–0022 took the numbers); my proposal session_id migration dropped (#55 added the column).
- Re-applied over #55's code: U5 (markParticipantNoShow), U14 (requestedRoomId + room request), achievement enum fields, U2 H-2 gate + U7 sibling-overlap guard (main's multiparty reschedule already covered the flows), web achievement-form category enum.
- Fixed merge dupes: schema `sessionId`, repo insert params; `tsgo`-based check-types after `bun install`.
- All wave-3 U-tests pass against the merged code (slots widened for #55's availability-window enforcement).

## Container-stop logs (user question)

- Postgres `FATAL: terminating connection due to administrator command` on stop is **inherent** when connections are open at shutdown (verified: 5 live connections → 5 FATALs); `stop_grace_period: 30s` (P4) gives postgres time to fast-shutdown cleanly, and app-before-db stop ordering (Coolify dependency order; RUNBOOK note) eliminates the lines.
- App-side stop is clean with the C8 fix: `shutdown_signal → redis_quit → db_pool_drained` verified.
