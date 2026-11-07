# CI coverage reuse

Allow frontend-only follow-up commits in mixed backend/frontend PRs to reuse
successful backend test and coverage results without starting databases again.

| Task                                                                                         | Status      |
| -------------------------------------------------------------------------------------------- | ----------- |
| Fingerprint the merged Git tree, including backend, shared packages, manifests and CI inputs | Implemented |
| Validate same-PR success proof and skip the complete backend job on a hit                    | Implemented |
| Preserve the required `Test + Coverage` check and fail on failed/cancelled dependencies      | Implemented |
| Pin backend Bun and service images; force full suite on manual dispatch                      | Implemented |
| Focused policy tests and workflow validation                                                 | In progress |
| Hosted first full run, then frontend-only follow-up proving reuse and source link            | Pending     |

Proofs expire after 14 days. Missing evidence or unavailable API means a full
suite. App-code PRs need an initial full run; docs/infra-only PRs keep the existing skip. No existing green
run is eligible unless it published the new proof artifact. Frontend source,
public assets, UI source/components and docs are excluded; manifests and every
unknown path remain fingerprint inputs. Revisit exclusions before backend tests
start reading these frontend/doc paths. Runner image updates are managed by
GitHub and are not part of the fingerprint.

Delete this one-shot plan on merge; the PR and CONTEXT retain the record.

Local validation does not prove hosted artifact upload/lookup or actual service startup.
The complete backend coverage suite was not rerun for this workflow-only change.
