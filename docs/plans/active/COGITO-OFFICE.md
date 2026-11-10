# Cogito Office integration

Approved specification: CEO, 10 November 2026. Scope: app-side blocks 1-4 and repository-side 0/6. Source contract is the attached CEO specification; docs/OFFICE-HANDOVER.md contains operator gates.

| Block | Repository status                                                                          | Acceptance gate                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0     | Disposable configured admins blocked; secure provisioning checklist                        | Operator rotates exposed credentials, removes shared Appendix A and existing public-test accounts, provisions keys |
| 1     | Snapshot adapter reuses dashboard analytics and projects privacy-safe fields               | Hosted DB tests, seeded privacy/parity and deployment latency under 2s                                             |
| 2     | Cookie attribution, nullable jsonb, manual override and campaign report                    | Real email/Google signup in non-production                                                                         |
| 3     | Transactional outbox, signed worker, retry and alert hooks                                 | Hosted migration/atomicity tests; receiver delivery within one minute                                              |
| 4     | Eleven approved actions, drafts, private assets, seven-day receipts and office audit actor | Hosted transaction/concurrency tests and approved Office dry run                                                   |
| 5     | Pending                                                                                    | Joint acceptance with Rafsi; not performed                                                                         |
| 6     | Runbook, OpenAPI and ownership checklist                                                   | Cogito ownership, vault recovery, non-production/live payment proof                                                |

Do not merge until CI and parent review assess the evidence. Keep null for unsupported KOL first-paid-completion metrics. Session report on-time means within 24h after end. Full DB and production acceptance must not be inferred from unit tests.

Review repair: source fixes implemented; local focused and type checks recorded in PR Evidence. Hosted integration and 100% coverage remain required and unproven until a fresh successful run.

Office campaign reporting: set server `OFFICE_CAMPAIGN_LABELS` to a JSON object, e.g. `{"school-open-day":"School Open Day"}`. Default `{}` exports empty campaign buckets. Maximum 100 entries / 16,384 JSON characters; identifiers start with a lowercase letter and contain at most 64 lowercase letters, digits, underscores or hyphens. Labels start with a letter and allow ASCII letters, digits, spaces and `._()-`, maximum 80 characters, no edge whitespace. Both reject runs of seven digits. Invalid configuration rejects server startup. Operators must approve non-personal identifiers and labels: syntax cannot determine whether a label is a person's name. Never configure personal data. Exact identifier matches export only the explicit label; aliases sharing a label merge within each source. Manual source overrides remain authoritative. Restart with reviewed env changes; snapshot cache can retain previous buckets for 120 seconds. No deployment or production config change performed.
