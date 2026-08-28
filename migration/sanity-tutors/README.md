# Sanity tutor migration

This workspace snapshots the legacy `tutor` documents from the Cogito Academy
Sanity dataset before Cogito App becomes the canonical tutor source.

## Backup

Run from the `cogito-app` repository root:

```sh
bun migration/sanity-tutors/scripts/extract.ts
```

The extractor is deterministic and safe to rerun. It writes:

- `extracted/tutors.published.json` — raw published tutor documents plus expanded references.
- `extracted/assets/` — original tutor profile images.
- `reports/inventory.json` — counts, hashes, missing fields, and duplicate-name checks.

The public Sanity dataset does not expose drafts without a read token. Therefore
this backup is explicitly **published-only**. Supply `SANITY_API_TOKEN` when a
read-only token becomes available to include draft documents in a separate
snapshot before final cutover.

## Intended access model

Legacy profiles imported from Sanity are website-only and are not automatically
Tutor accounts in Cogito Digital. An admin sends an invitation to the tutor's
verified email. Claiming that invitation links the account to the existing
profile; it must not create a duplicate profile. Digital publication remains a
separate admin-controlled step after onboarding and booking setup are complete.

