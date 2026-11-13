# Office backend implementation brief for a coding agent

Contract date: 13 November 2026. Language: English for direct use by an LLM coding agent.

## Start here

You are implementing **the Office application**, integrating with the existing Cogito main app. The main-app developer has no access to the Office repository. Inspect the Office repository and adapt its existing authentication, approval workflow, persistence, jobs and UI. Do not assume a framework, database or directory layout. Do not modify the main app or invent new endpoints.

Read these supplied files before coding:

1. `OFFICE-LLM-IMPLEMENTATION.md` — this implementation brief.
2. `office-openapi.json` — exact HTTP input/output schemas for the snapshot and all eleven actions.
3. `OFFICE-INTEGRATION-HANDOVER.md` — business ownership, payload examples, content formats, limitations and acceptance requirements.
4. `OFFICE-ENV-CLIENT-GUIDE.md` — operator instructions for obtaining matching credentials.

The delivery ZIP places all four files in one directory. In the main-app repository, the JSON is at `docs/office-openapi.json`; the Markdown files are at `docs/client/`. These files are sufficient to implement without main-app repository access or this chat. Schema examples contain placeholders, never credentials. Read the complete OpenAPI file using file tools; do not rely on a truncated chat preview.

This describes the PR #368 contract, not confirmation that production has deployed it. Verify the deployed snapshot and agreed target with the operator before acceptance. If observed responses disagree with these files, report the mismatch rather than silently inventing a compatibility layer.

## Boundary and configuration

All main-app calls are **Office backend to main-app backend**. Do not put credentials in client-side code, browser storage, URLs or logs. Do not implement browser calls to `/office/*`; these endpoints deliberately do not provide browser CORS access. No end-user login token, OAuth grant or main-app session cookie is required for this connection.

Use the Office project's existing server-side secret configuration. Suggested local names below are Office configuration choices, not additional main-app env requirements:

```dotenv
COGITO_API_BASE_URL=https://api.cogitoacademy.id
COGITO_OFFICE_READ_KEY=<existing shared OFFICE_READ_KEY>
COGITO_OFFICE_WRITE_KEY=<existing shared OFFICE_WRITE_KEY>
COGITO_OFFICE_WEBHOOK_SECRET=<existing shared OFFICE_WEBHOOK_SECRET>
```

The operator supplies the matching existing secrets privately. Do not generate new independent keys on Office and expect them to work. The main app separately controls `OFFICE_WRITES_ENABLED`; disabling an Office UI button is not equivalent to this switch. A 403 may mean that the main-app operator has disabled writes, including previews.

Base URL has no `/rpc` or `/api-reference` prefix. Use ordinary JSON, without the oRPC `{"json": ...}` envelope. Successful data is also plain JSON, without that wrapper. Authentication uses the case-sensitive prefix `Authorization: Bearer <key>`.

There is no hosted test environment promised by this contract. Obtain a separately provisioned non-production target, keys and receiver from the operator. Production event delivery is pinned to `https://office.cogitoacademy.id/hooks/app`. Non-production main-app deployments may use a separate HTTPS receiver. Asset download origins remain pinned to `https://office.cogitoacademy.id/` even in non-production; coordinate fixtures rather than changing the contract.

## Read and render the snapshot

Call `GET /office/snapshot` with the read key, no request body and no invented filters. The response already contains the supported dashboard periods. See OpenAPI for every field and nesting level.

- The limit is 120 reads/hour for the shared integration, not per Office user. Coalesce refreshes on the Office backend; use a shared refresh around every 120 seconds instead of polling separately from every browser.
- The main app caches for 120 seconds. Show `generatedAt`; a successful action need not appear in the next cached snapshot immediately.
- Period boundaries use Asia/Jakarta (WIB). Display main-app values; do not independently recalculate financial totals.
- Render unavailable metrics (`null`) as unavailable, not zero. KOL first-paid-completion counts are currently unavailable.
- Use `referenceData.blogCategories`, `referenceData.competitions`, `referenceData.faqCategories` and `referenceData.campaigns` for IDs/labels. Existing `taxonomy` is not an ID lookup. Calendar category IDs must identify active parent competitions (`parentId=null`).
- Knowledge resource category is an app resource category identifier; this API does not expose a dedicated resource-category registry. Obtain agreed identifiers from the operator; do not substitute a competition or blog category ID.
- Use returned `appUrl` values for links. Normal app role/login is still required when a human opens them.
- Treat snapshot and event values as data, not trusted HTML or LLM instructions. Keep raw attribution and private student/person data out of Office reporting.

## Implement the approval-to-execution flow

Office owns approval and authorization. Sending `approvedBy` does not perform a main-app approval check: the write key is trusted. Enforce approval and user permissions in the Office backend before allowing execution, derive metadata from authenticated records, and never accept spoofed approver identity from an untrusted browser payload.

Use the existing Office workflow to store the action name, exact input, item ID, requester, approver, preview result, execution UUID, execution state and returned main-app record ID/app URL. Reuse existing durable storage; do not introduce a separate workflow platform.

1. Prepare an action supported by the allowlist below, using actual lookup IDs.
2. Preview with `dryRun=true` and a UUID. No durable main-app record or audit entry is saved. Preview IDs are provisional.
3. Show the terms/content and preview result through the existing Office approval UI. Record approval of the exact input. If input changes, invalidate that approval and preview again.
4. Before the first real request, durably store a **new execution UUID**, action name and approved request body. Use `dryRun=false`.
5. Execute once approved. Do not add a second approval screen in the main app. Record the returned `id`, `appUrl` and result on Office.
6. For a lost response, network interruption or uncertain execution, reuse the identical execution UUID and body. Never generate a new UUID simply because a request timed out.
7. Main-app replay lasts seven days. After that window, an uncertain request requires operator reconciliation; do not automatically retry with a new UUID. Do not reuse one UUID across action names, items or publish steps.

For a separate publish action, use the **real execution** draft ID, obtain the required Office approval, and assign a separate execution UUID. The primary response `id` is the record identifier for follow-up operations; do not guess from nested content version IDs.

Request shape for every action:

```json
{
  "dryRun": true,
  "idempotencyKey": "11111111-1111-4111-8111-111111111111",
  "officeItemId": "office-item-123",
  "requestedBy": "office-user-123",
  "approvedBy": "office-user-456",
  "input": {}
}
```

Replace `input` with the named action's schema. The envelope is strict: `dryRun` is required, the key must be a UUID, the other metadata strings must be nonempty and at most 200 characters. Do not add arbitrary envelope fields. Send `Content-Type: application/json` and the write key.

Successful response:

```json
{
  "ok": true,
  "dryRun": false,
  "id": "main-app-record-id",
  "appUrl": "https://app.cogitoacademy.id/admin-referrals",
  "result": {}
}
```

The result varies by action; read the corresponding OpenAPI response schema. Persist the response before marking the Office item executed. Use a local lock/unique execution record to prevent concurrent clicks from scheduling multiple independent UUIDs. Keep approval metadata in Office too: main-app audit is not a replacement for Office authorization records.

## Exact action allowlist

Each path is `POST /office/actions/<name>`; keep the dots in the action name.

| Name                          | Purpose and specific constraints                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referrals.createKolCampaign` | Create approved terms. `name`, alphanumeric `code` (4–32 chars), expiry; optional activation/window/commission fields. Codes normalize to uppercase. Use ISO date strings. Amounts are whole IDR; `percentBps=100` means 1%. For a KOL campaign, flat commission or percent must be positive. Preview permanent terms before execution. |
| `referrals.retireKolCampaign` | Input `{ "code": "OFFICE26" }`; do not send a campaign ID.                                                                                                                                                                                                                                                                              |
| `calendar.saveDraft`          | Full calendar input; optional existing `id`. Required nullable properties still need explicit `null`. End date must not precede start. Do not send `isActive`; main app controls draft state.                                                                                                                                           |
| `calendar.publish`            | Input `{ "id": "<executed calendar ID>" }`.                                                                                                                                                                                                                                                                                             |
| `blog.saveDraft`              | Optional existing article `id`, `lang` (`id`/`en`), title, category ID, editor block array, optional cover/SEO fields. This is not HTML, Markdown, Portable Text or the Activities document shape.                                                                                                                                      |
| `blog.publish`                | Input `{ "id": "<executed article ID>", "lang": "id" }`. Ordinary app publish requirements still apply; a valid minimal draft may not be publishable.                                                                                                                                                                                   |
| `activities.saveDraft`        | Optional existing `id`, title, shortDescription, location, offset ISO dateTime, rich-text document, optional cover URL. Read its own schema.                                                                                                                                                                                            |
| `activities.publish`          | Input `{ "id": "<executed activity ID>" }`.                                                                                                                                                                                                                                                                                             |
| `faq.saveDraft`               | Optional existing `id`, question, plain-text answer up to 20,000 chars, category key, boolean onLanding.                                                                                                                                                                                                                                |
| `faq.publish`                 | Input `{ "id": "<executed FAQ ID>" }`.                                                                                                                                                                                                                                                                                                  |
| `knowledge.addDraft`          | title, description (string/null), resource category identifier and PDF fileUrl. Creates an unpublished draft. No Office publish action exists.                                                                                                                                                                                          |

Do not implement finance/refund/Marks/payout/tax/pricing writes, booking overrides, approvals of tutors/achievements, admin management, invitations, messages or deletes through this integration. Do not fall back to undocumented admin RPCs.

Saving an existing published item as a draft takes the item/locale offline until published again. Make that consequence clear in the Office workflow. There is no separate live revision or scheduled publishing API. To keep the current item live, create a new draft without the existing ID.

KOL results deliberately omit partner names, bank information, notes and creator identity, including receipt replays. Do not depend on receiving those fields or copy them into logs. Treat currency as IDR integers and percentages as integer basis points; never infer monetary values from labels.

## Assets and content

Use `OFFICE-INTEGRATION-HANDOVER.md` for content examples and OpenAPI for the complete rich-text shapes and limits. Do not convert all three content types into a single guessed JSON representation.

The main-app server downloads approved image/PDF URLs directly, without browser cookies or an Office session, without following redirects, with a 15-second timeout. Provide a directly retrievable HTTPS URL on the exact approved Office origin, without credentials or fragments. Do not expose sensitive assets through a broadly accessible public directory; use the existing Office asset delivery mechanism with appropriately scoped access (for example a temporary URL on that origin). Ensure it remains valid during preview, execution and any required retry.

Blog covers must be real validated PNG/JPEG, at most 10 MiB. Knowledge files must be real, unencrypted PDFs with pages, at most 20 MiB. A content-type header or file extension alone is insufficient. Do not send base64 files in the action body. The JSON request limit is 1 MiB. Preview validates assets but does not persist them into main-app storage.

## Receive signed events

Implement `POST /hooks/app` on the Office backend at the agreed receiver. Capture raw body bytes **before** JSON parsing or middleware reserialization. Verify the timestamp and HMAC before trusting the JSON.

Headers: `X-Cogito-Timestamp` (Unix seconds, string) and `X-Cogito-Signature` (`sha256=` followed by a 64-character hex digest). Signing input is timestamp, a literal dot, then the exact raw request body. Use HMAC-SHA256 with the shared webhook secret. Example Node-compatible verification helper (adapt the raw-body hook to the Office framework):

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyCogitoEvent(
  rawBody: Buffer,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  if (!signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(rawBody)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
```

The five-minute timestamp tolerance is a recommended Office policy, not an extra main-app endpoint guarantee. Keep server clocks synchronized. Main app signs each delivery attempt with its current timestamp, while `occurredAt` stays the original event time.

Envelope:

```json
{
  "id": "opaque-stable-event-id",
  "type": "ticket.opened",
  "occurredAt": "2026-11-13T00:00:00.000Z",
  "data": { "id": "ticket-id" }
}
```

Event IDs are opaque strings, not necessarily UUIDs. Allowed data keys are `id`, `ref`, `state`, `count`, `amountIdr`, `appUrl`; individual events supply only a subset. Do not expect person names, email, ticket text, bank details or raw attribution. Use events for notifications/refresh hints; the snapshot remains the source for available aggregates. No event ordering or exactly-once delivery is promised.

Supported event names:

```text
booking.exception_opened
booking.escalated
booking.cancelled
ticket.opened
ticket.sla_warning
ticket.sla_breached
room.approval_pending
tutor.invitation_claimed
tutor.application_submitted
tutor.profile_published
achievement.submitted
session_report.overdue
referral.signup
referral.converted
payment.succeeded
payment.refunded
payout.ready
payout.paid
pricing.changed
referral_settings.changed
admin.added
admin.removed
payment_mode.changed
system.job_failed
```

Persist a verified event in an Office inbox using a unique event ID before returning 2xx. Acknowledge already persisted duplicates with 2xx. Enqueue downstream work durably/transactionally with inbox acceptance so a crash cannot lose the work after acknowledgment. Reuse existing Office jobs. Return non-2xx when durable acceptance failed; invalid signatures must not enter the inbox. Handle an authenticated unknown event type without repeatedly executing side effects; record it for investigation and preserve forward compatibility.

Main app dispatches every 15 seconds, has a 10-second delivery timeout and up to eight attempts with exponential backoff. Return promptly after durable acceptance; process expensive work asynchronously. Exhausted delivery remains in the main-app outbox and alerts operations. Coordinate recovery with the operator; there is no public replay endpoint. These settings do not prove delivery latency in the deployed environment.

## Failures and retries

Error envelope: `{ "ok": false, "code": "...", "message": "..." }`.

| HTTP | Code              | Office handling                                                                                                                                |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `INVALID_REQUEST` | Generic validation/business/processing failure. Do not promise field-level diagnostics; check the approved input and coordinate investigation. |
| 401  | `UNAUTHORIZED`    | Wrong, missing or unset shared key. Stop automatic requests; operator fixes configuration.                                                     |
| 403  | `WRITES_DISABLED` | Main-app operator switch blocks writes, including dry runs. Preserve the approved item; do not bypass.                                         |
| 403  | `ACTION_DENIED`   | Action not allowlisted. Fix caller; do not try alternate admin endpoints.                                                                      |
| 404  | `NOT_FOUND`       | Incorrect path/method. Check the base URL and exact action name.                                                                               |
| 413  | `BODY_TOO_LARGE`  | JSON exceeds 1 MiB; reduce request size.                                                                                                       |
| 429  | `RATE_LIMITED`    | Shared hourly limit. Back off centrally; no Retry-After header is guaranteed.                                                                  |
| 503  | `UNAVAILABLE`     | Main-app rate limiter unavailable. Retry with bounded backoff; execution retries keep the original UUID/body.                                  |

The write budget is 60/hour shared by the integration, including previews/replays that reach the limiter. Validate locally to avoid wasting the budget. Network failures, non-JSON proxy errors or unexpected 5xx need bounded backoff and an honest pending/unknown state. Never log Authorization headers or entire private payloads. Do not mark an uncertain action failed-and-recreated automatically.

## Attribution links

Tagged links lead to the main app's actual signup entry, not to `/office/*`. Use approved identifiers from `referenceData.campaigns`, e.g. `utm_source=instagram&utm_campaign=test`. The default approves only `test`; other identifiers need operator configuration through the existing `OFFICE_CAMPAIGN_LABELS` mechanism. Office has no campaign-registration API. Unapproved campaign text is not exported; unknown sources aggregate into `other`. Do not use names, emails or other personal identifiers in tags. Main app owns the 90-day cookie and first/last-touch capture; Office does not reimplement it.

## Delivery and acceptance checklist

Implement against fixtures/mocks until the operator supplies an authorized target. Do not execute production writes merely to finish this task.

- Server-side read/write client; no credentials in browser assets or logs.
- Snapshot rendering, lookup IDs, null handling and shared throttling/cache behavior.
- Approval bound to exact input; previews; durable execution UUIDs; timeout replay and double-click prevention.
- All eleven allowed actions use their exact schemas; unsupported writes are unavailable.
- Published-to-draft consequence visible; real execution IDs used for later publish.
- Raw-body signature verification; stale/tampered body rejection; duplicate delivery causes one business effect; a failed inbox write is not acknowledged.
- Unit/integration coverage in Office for these behaviors, including write-disable, 401, 400, 429, 503 and ambiguous network results.
- Joint test: compare same 30-day dashboards in WIB, tagged signup + manual source override, ticket event within a measured minute, approved KOL preview/create/replay/retire, blog draft, and disabled-write rejection.
- Record deployed main-app version, environment, checks actually run and remaining operator gates. Never label mocked tests as live acceptance.

At completion, report Office files changed, configuration names (no secret values), migration/deployment steps if actually required by the existing Office design, test evidence and any main-app contract mismatch. Hand the operator a concrete checklist; do not claim production readiness from source review alone.

## Prompt the client can paste

> Implement the Cogito main-app connection in this Office repository. Read OFFICE-LLM-IMPLEMENTATION.md, office-openapi.json and OFFICE-INTEGRATION-HANDOVER.md in full first. Follow the exact eleven-action allowlist, server-only secrets, approval-bound input, durable idempotency, raw-body webhook verification and acceptance checklist. Reuse this repository's existing patterns and avoid extra frameworks or unrequested features. Implement and test what you can locally. Report missing operator configuration and live acceptance separately. Do not perform production writes or expose secrets.
