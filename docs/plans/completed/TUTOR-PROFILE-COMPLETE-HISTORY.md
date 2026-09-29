# Tutor Profile Complete History

Status: Completed locally 2026-09-29

## Goal

Make admin tutor review useful for small and broad edits by preserving complete
profile before/after snapshots and showing exact values for changed fields.

## Completed

- Store one complete profile snapshot pair on each successful state-changing tutor profile save.
- Record deterministic changed leaf paths in `details.changedFields`.
- Cover direct-live fields, pending-review fields, specializations, and photos.
- Audit canonical account-name changes with the same profile save transaction.
- Compare proposal revisions against prior proposed values.
- Include the complete post-promotion profile in admin approval snapshots.
- Render changed field Before/After values from the full snapshots in review history.
- Rename pending panel to **Fields awaiting approval** so its scope is explicit.
- Add snapshot/helper and service regression tests; sync API, module, context, and runbook docs.
