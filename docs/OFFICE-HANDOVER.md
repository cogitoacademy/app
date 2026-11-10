# Cogito Office operator setup and acceptance

Source: CEO-approved specification, 10 November 2026. This checklist records operator gates; implementing code does not prove production setup or the joint Rafsi test.

## Provision the connection

1. Use a non-production deployment with its own PostgreSQL, Redis, storage and payment sandbox. Confirm exact DATABASE_URL and backup before applying forward migrations (`bun run db:migrate`); never use reset or production seed for this rollout.
2. Generate three independent random 32-byte values inside the approved password manager. Store OFFICE_READ_KEY, OFFICE_WRITE_KEY and OFFICE_WEBHOOK_SECRET in the Cogito vault and Coolify. Exchange them with Rafsi through the password manager. Do not paste values into terminals, logs, PRs, tickets or chat.
3. Set OFFICE_WEBHOOK_URL=https://office.cogitoacademy.id/hooks/app. Start with OFFICE_WRITES_ENABLED=false. Set true only after dry-run/action acceptance. Removing or replacing a key revokes that capability on the next request; restart deployment after changing Coolify environment.
4. Check API/Redis health. Test unset, wrong and correct keys using a client that redacts Authorization. Confirm Origin requests receive no Access-Control-* headers. Read limit is 120/hour; write limit is 60/hour.
5. The Office must retain event IDs, verify HMAC over timestamp + '.' + exact raw JSON body, reject stale timestamps, and deduplicate retries. Check one event arrives within a minute, then simulate receiver failure and recovery in the non-production deployment. Inspect outbox attempt counts without printing payloads.

## Security cleanup requiring operator access

- Rotate the exposed Coolify and OVH passwords in their own dashboards; revoke sessions and verify Cogito two-step authentication. Remove Appendix A containing credentials from every shared copy and revision/distribution location under Cogito control. Repository changes cannot revoke already shared credentials.
- Inventory production public test mailboxes, especially admin accounts. Remove their access and accounts through the approved operator flow after verifying the exact deployment. The repository filters Yopmail domains from the configured admin allowlist; it does not delete existing accounts.
- Never decrypt vault secrets during this implementation. Confirm Rafsi possesses the SOPS age private key through a private recovery rehearsal performed by the operator.

## Ownership and handover inventory

For each service record the Cogito owner, recovery contact, two-step verification and recovery proof in the private handover: GitHub repository, Coolify, OVH, Cloudflare/R2, Resend, Midtrans, Sanity, Google Cloud (Meet/Calendar), Uptime Kuma and Discord alerts. Ownership transfer is an operator gate.

The app's Referrals and KOL screens own immutable campaign terms, retirement and commission history; Economy Settings owns rate cards and reward settings. Office writes cover only the approved campaigns and content actions. Blog locales publish separately. Activities, FAQ and Audit Log stay in the app's admin workflow. Calendar and Knowledge Bank have database implementations but active production source remains controlled by CC_SOURCE and KB_SOURCE; inspect deployed values and follow the existing activation/rollback runbook before claiming migration from Sanity complete. Publishing Knowledge Bank material stays in the app.

## Joint acceptance with Rafsi (not performed by this implementation)

- [ ] Rafsi provisions all three secrets on the Office.
- [ ] Same 30-day dashboard and Office totals, with WIB boundaries.
- [ ] Tagged signup appears in campaign reporting; admin manual override wins.
- [ ] Support ticket reaches Office within one minute with no personal text.
- [ ] Approved KOL dry-run, create, replay, concurrent replay and retire preserve history.
- [ ] Blog draft appears in app; publish locale explicitly.
- [ ] OFFICE_WRITES_ENABLED=false refuses writes.
- [ ] Receiver signature/retry and exhausted-event Discord alert verified live.
- [ ] Production cleanup, ownership and vault recovery checked by operators.

## Deployment, recovery and payments

Use the existing RUNBOOK deployment, backup restore, KB/calendar activation and Midtrans procedures. Deploy the reviewed SHA with forward migrations and confirm health before enabling Office writes. Roll back by disabling writes and restoring the previous application image; keep additive migration data and outbox/idempotency rows. Restore a verified backup only against the explicitly approved target using the documented restore procedure, followed by reconciliation of payments and events.

For Midtrans live acceptance: operator obtains Cogito live keys privately, sets PAYMENT_PROVIDER=midtrans and MIDTRANS_MODE=live with the matching keys, configures the HTTPS notification URL and verifies signature checks. Make one authorized low-value real purchase, confirm exactly one paid wallet credit and payment audit, then perform the approved refund/reconciliation procedure. Record provider transaction IDs privately. Do not claim live payment acceptance based on sandbox tests. Disable Office writes during any incident; key revocation is independent for reads, writes and event signing.

Office campaign reporting: set server `OFFICE_CAMPAIGN_LABELS` to a JSON object, e.g. `{"school-open-day":"School Open Day"}`. Default `{}` exports empty campaign buckets. Maximum 100 entries / 16,384 JSON characters; identifiers start with a lowercase letter and contain at most 64 lowercase letters, digits, underscores or hyphens. Labels start with a letter and allow ASCII letters, digits, spaces and `._()-`, maximum 80 characters, no edge whitespace. Both reject runs of seven digits. Invalid configuration rejects server startup. Operators must approve non-personal identifiers and labels: syntax cannot determine whether a label is a person's name. Never configure personal data. Exact identifier matches export only the explicit label; aliases sharing a label merge within each source. Manual source overrides remain authoritative. Restart with reviewed env changes; snapshot cache can retain previous buckets for 120 seconds. No deployment or production config change performed.
