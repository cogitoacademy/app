# Tutor Profile Canonical Fields

Status: Completed locally 2026-09-25

## Goal

Replace tutor credential aliases with one canonical contract and add required-on-review affiliation.

## Completed

- Renamed profile/API/UI fields to `achievements` and `experiences`.
- Renamed tutor types and validators; removed runtime aliases and text fallbacks.
- Added nullable persisted `affiliation`, optional for drafts and required for review.
- Included affiliation and canonical arrays in pending moderation, admin diffs, discovery, public drawer, seeds, and tests.
- Added migration `0051_short_hobgoblin.sql` with physical column renames and obsolete pending-key removal.
- Aligned Education, Achievements, and Experiences editor layouts and product labels.
- Updated architecture, API, module, and operations docs.

## Verification

Formatter and targeted API tests pass. Migration metadata is present. Final root typecheck remains blocked by an unrelated deleted Xendit provider import; React Doctor reports existing maintainability/accessibility warnings in touched components.
