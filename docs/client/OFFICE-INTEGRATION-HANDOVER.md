# Cogito Office integration handover

13 November 2026. Based on the CEO-approved **Main App Connection Request** of 10 November. This describes the main app contract; joint Office acceptance and production configuration must be recorded separately.

Start here:

- [Portable Office OpenAPI](../office-openapi.json): import into your API client or use to implement the Office backend.
- [Environment and vault access](OFFICE-ENV-CLIENT-GUIDE.md): how Rafsi obtains and changes the three shared secrets.
- [Operator checklist](../OFFICE-HANDOVER.md): ownership, credential cleanup, recovery and joint testing.
- [Operations runbook](../RUNBOOK.md): deployment, rollback, backup restore and Midtrans live acceptance.
- [Release handover](RELEASE-V3-HANDOVER.pdf): includes the dated Office addendum alongside the existing V3 handover.

## Responsibilities

Office owns the request, CEO approval and its internal workflow. Once approved, its backend sends the action to the main app. The main app validates it using the same business rules as the admin screens, saves it transactionally, and records actor `office` with `officeItemId`, `requestedBy` and `approvedBy`. There is no second approval step in the main app.

| Area                        | Main app surface               | Office capability                                                                                                  |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Referrals and KOL campaigns | Referrals (`/admin-referrals`) | Read snapshot; preview/create an approved campaign; retire its code. Existing attribution and commissions remain.  |
| Commissions                 | Referrals → commissions        | Read monthly totals. Reconciliation and recording transfers stay in the app.                                       |
| Economy Settings            | `/admin-economy`               | Read student-facing pricing and referral settings. No changes from Office.                                         |
| Blog                        | `/admin-blog`                  | Save a draft and publish a specified locale (`id` or `en`).                                                        |
| Activities                  | `/activities`                  | Save draft and publish.                                                                                            |
| FAQ                         | `/faq`                         | Save draft and publish; use category keys from reference data.                                                     |
| Competition Calendar        | `/calendar`                    | Save draft and publish; use parent competition IDs from reference data.                                            |
| Knowledge Bank              | `/knowledge-bank`              | Add an unpublished PDF draft. Publishing stays in the app.                                                         |
| Audit Log                   | `/admin-audit`                 | Read the privacy-filtered latest 200 entries in the snapshot. Main app records saved Office actions automatically. |

Refunds, Marks/wallets, payouts, tax, pricing, referral reward settings, booking overrides, tutor/achievement approvals, invitations, messages, admins and deletes are outside the Office write API.

## Connect without a user login

Base URL: `https://api.cogitoacademy.id`. Office requests come from its backend, never from browser JavaScript. The keys do not sign a user into either application.

| Operation                     | Authentication                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /office/snapshot`        | `Authorization: Bearer <OFFICE_READ_KEY>`                                                   |
| `POST /office/actions/<name>` | `Authorization: Bearer <OFFICE_WRITE_KEY>`; main app must have `OFFICE_WRITES_ENABLED=true` |
| Main app → Office event       | Office verifies using `OFFICE_WEBHOOK_SECRET`                                               |

Store the three existing generated values privately on both backends. The production vault explicitly enables Office writes; verify the running deployment instead of assuming that a vault edit changed it. Do not expose tokens in logs, screenshots or frontend env. Reads are limited to 120/hour and writes to 60/hour. The snapshot cache lasts up to 120 seconds; show `generatedAt` and use the action response to confirm immediate success.

## Read the snapshot and lookup IDs

The snapshot reuses dashboard analytics for `7d`, `30d`, `90d` and `thisMonth`, using WIB calendar boundaries. Compare the same period and account for the cache. Unsupported metrics are `null`, not fabricated zeroes; KOL `firstPaidCompletions` is currently unavailable.

The additional `referenceData` object avoids hardcoded database IDs:

```json
{
  "competitions": [
    { "id": "competition-debate", "label": "Debate", "parentId": null }
  ],
  "blogCategories": [
    { "id": "<actual category ID>", "label": "Study tips", "parentId": null }
  ],
  "faqCategories": [{ "id": "about", "label": "About Cogito" }],
  "campaigns": [{ "id": "test", "label": "test" }]
}
```

These are illustrative values. Use the actual response IDs. `calendar.saveDraft.categoryIds` takes active parent competitions (`parentId=null`); `blog.saveDraft.category` takes a blog category ID; `knowledge.addDraft.category` uses the app's resource category identifier. Existing `taxonomy` retains its original name-only shape. The snapshot's `appUrl` and action response's `appUrl` open the corresponding app surface; opening those pages still requires the normal app login and role.

## Action envelope

All eleven actions use ordinary JSON, **not** the `{"json": ...}` wrapper used by the separate oRPC interface.

```json
{
  "dryRun": true,
  "idempotencyKey": "11111111-1111-4111-8111-111111111111",
  "officeItemId": "office-item-123",
  "requestedBy": "office-requester",
  "approvedBy": "office-approver",
  "input": {
    "name": "November campaign",
    "code": "OFFICE26",
    "activationAt": "2026-11-20T00:00:00+07:00",
    "expiresAt": "2027-01-01T00:00:00+07:00",
    "flatAmountIdr": 10000,
    "percentBps": 0
  }
}
```

Send this example to `POST /office/actions/referrals.createKolCampaign`, replacing the example UUID and metadata. Always preview KOL terms before execution because saved terms are permanent. `dryRun=true` validates through the real services then rolls back the database transaction; it does not write storage or an audit entry. For execution, send `dryRun=false` with a fresh UUID. Retry that execution with the same UUID; within seven days it returns the first saved result without performing another write. Keep the action and input the same when retrying. Do not share one execution UUID between different Office items.

A successful response has this shape:

```json
{
  "ok": true,
  "dryRun": false,
  "id": "<saved record ID>",
  "appUrl": "https://app.cogitoacademy.id/admin-referrals",
  "result": {
    "id": "<saved campaign ID>",
    "code": "OFFICE26",
    "activationAt": "2026-11-20T00:00:00+07:00",
    "expiresAt": "2027-01-01T00:00:00+07:00",
    "attributionWindowDays": 90,
    "flatAmountIdr": 10000,
    "percentBps": 0,
    "pausedAt": null,
    "retiredAt": null
  }
}
```

The preview has `dryRun=true`; its new record IDs are provisional and are rolled back. Use the execution response ID for later publish/retire operations. KOL responses deliberately exclude campaign/partner names, bank details, private notes and creator identity, including on receipt replay. These may still be stored in the app where appropriate; Office must not depend on receiving them.

## The eleven approved actions

| Name                          | `input`                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referrals.createKolCampaign` | Same validated campaign form fields as the app. Dates are ISO strings; commission is whole IDR / basis points. See the OpenAPI schema for optional fields and defaults.                                   |
| `referrals.retireKolCampaign` | `{ "code": "OFFICE26" }`                                                                                                                                                                                  |
| `calendar.saveDraft`          | Optional `id`, title, description/location, ISO start/end dates, `categoryIds`, education levels, scale, organizer, registration deadline/links. Nullable fields must be supplied as shown in the schema. |
| `calendar.publish`            | `{ "id": "<saved calendar ID>" }`                                                                                                                                                                         |
| `blog.saveDraft`              | Optional `id`, `lang`, title, `body` in the app editor's block format, `category` ID, optional `coverImageUrl` and supported SEO fields.                                                                  |
| `blog.publish`                | `{ "id": "<article ID>", "lang": "id" }`                                                                                                                                                                  |
| `activities.saveDraft`        | Optional `id`, title, shortDescription, location, ISO `dateTime`, rich-text `body`, optional coverImageUrl.                                                                                               |
| `activities.publish`          | `{ "id": "<activity ID>" }`                                                                                                                                                                               |
| `faq.saveDraft`               | Optional `id`, question, answer (at most 20,000 characters), category key, onLanding.                                                                                                                     |
| `faq.publish`                 | `{ "id": "<FAQ ID>" }`                                                                                                                                                                                    |
| `knowledge.addDraft`          | title, nullable description, category identifier, Office PDF `fileUrl`.                                                                                                                                   |

For example, blog `input` uses these blocks, not HTML:

```json
{
  "lang": "id",
  "title": "Panduan persiapan kompetisi",
  "category": "<ID from referenceData.blogCategories>",
  "body": [{ "type": "paragraph", "runs": [{ "text": "Isi artikel." }] }]
}
```

Activities uses the existing FAQ rich-text document format (`{"type":"doc","blocks":[{"type":"paragraph","content":[{"text":"Content"}]}]}`). Publishing blog content must also satisfy the app's ordinary publish requirements, including required media/SEO fields. Saving a minimal draft does not guarantee it is publishable.

**Draft behavior:** saving an existing published item as a draft takes that item/locale offline until explicitly published again. This follows the current single draft/published state. There is no separate live revision, scheduled publishing or extra approval workflow. To keep an existing live item available, create a new draft without its ID.

Image/PDF URLs are accepted only from `https://office.cogitoacademy.id/`, without redirects or URL credentials. Blog covers accept validated PNG/JPEG up to 10 MiB. Knowledge PDFs must be real, unencrypted PDFs with pages, at most 20 MiB; structural validation is not malware scanning. Knowledge publishing stays in the app.

## Attribution and campaign identifiers

The app saves bounded first-touch and last-touch attribution in a first-party cookie for 90 days and on email/Google account creation. Admin manual classification wins over first-touch source in reporting. Raw attribution stays in the app and is not sent to third parties.

To satisfy the documented test, `?utm_source=instagram&utm_campaign=test` reports source `instagram`, campaign `test` with the default approved mapping. For real campaigns, the operator configures `OFFICE_CAMPAIGN_LABELS`, for example `{"test":"test","school-open-day":"School Open Day"}`. Office can list approved identifiers through `referenceData.campaigns` and use those identifiers in tagged links. Unapproved campaigns collapse into the empty label; unapproved sources aggregate into `other`. Arbitrary user-provided UTM text is never a display label.

This reuses the existing bounded config instead of introducing a new campaign registry or Office write action. Adding a new approved identifier is an operator env change through SOPS and the existing apply/restart workflow. If the team later needs self-service ad-campaign registration, agree that additional scope separately.

## Events and recovery

The app writes outbox events in the same database transaction as the relevant business change. A BullMQ dispatcher runs every 15 seconds, signs the exact raw JSON body and retries failures with exponential backoff for up to eight attempts. Exhausted events remain in the outbox and trigger the Discord operations alert. Actual delivery within a minute still needs the joint receiver test; the dispatch interval alone is not an SLA measurement.

Office must verify `X-Cogito-Timestamp` and `X-Cogito-Signature` (`sha256=` plus HMAC-SHA256 of `timestamp + "." + rawBody`), reject stale timestamps and deduplicate event IDs. Respond successfully only when Office has accepted the event. The payload contains `{id,type,occurredAt,data}` and only IDs, refs, states, counts, amounts and approved app URLs. New `booking.escalated` events exclude completed/cancelled/other terminal booking states using the same eligibility as the snapshot.

The event list remains exactly the original request: booking exceptions/escalations/cancellations; ticket open/SLA warning/breach; room approval; tutor invitation/application/publication; achievement submission; report overdue; referral signup/conversion; payment success/refund; payout ready/paid; pricing/referral settings/admin/payment-mode changes; exhausted scheduler jobs. These are notifications, not extra write permissions.

Errors use `{ "ok": false, "code": "...", "message": "..." }`: 401 for authentication; 403 for disabled/denied writes; 429 for hourly limits; 400 for invalid input or business rules; 413 for a body above 1 MiB; 503 if the rate limiter is unavailable. Do not keep retrying validation errors. For an uncertain execution result, retry the same execution ID rather than making another campaign or draft.

## Environments, data sources and acceptance

No hosted non-production app/Office copy was provisioned by this change. Local database tests use a separately created `cogito-test` database on loopback port 6769 and isolated Redis; these are not a client staging environment. For a persistent non-production copy, the operator must provision separate app/web deployments, PostgreSQL, Redis, storage, secrets and Midtrans sandbox credentials. Run forward migrations on that target. Use `NODE_ENV=staging` with the normal production-like protections; the portable OpenAPI file avoids opening private API documentation.

Non-production may configure its own HTTPS `OFFICE_WEBHOOK_URL`; production remains pinned to `https://office.cogitoacademy.id/hooks/app`. Asset origins remain pinned separately. Test asset ingestion using controlled fixtures or an approved isolated arrangement for the same Office origin. Do not aim staging writes/events at production without explicit operator agreement.

The main app production vault currently selects `CC_SOURCE=database`, `KB_SOURCE=database`, and `CONTENT_ADMIN_ENABLED=true` (non-secret selectors checked during this update). Calendar and Knowledge Bank therefore have a database-backed configured source; the running deployment still needs verification. The separate public website's consumers are outside this main-app check and may have their own source selection.

The implementation can be locally validated without changing production. Client acceptance still requires Rafsi to record: matching 30-day dashboards; tagged signup/manual override; ticket delivery within a minute; approved KOL preview/create/replay/retire; blog draft; write-disable rejection; webhook signature/retry handling. Confirm actual deployed keys and restart/apply results. Ownership, age-key recovery, exposed-password rotation, public-mailbox test-account cleanup and real Midtrans acceptance remain the operator checklist, not claims made by these tests.
