import { Elysia, type Context as ElysiaContext } from "elysia";
import { services } from "@cogito-app/api";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";
import { log } from "@cogito-app/api/lib/logger";
import { getClientIp, readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import { isProductionLike } from "@cogito-app/env/node-env";
import { env } from "@cogito-app/env/server";
import { PaymentNotFoundError } from "@cogito-app/api/modules/payment/payment.errors";

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export function paymentWebhookIdempotencyKey(
  provider: string,
  payload: {
    providerEventId?: string | null;
    providerReference?: string | null;
    status: string;
  },
) {
  const eventReference =
    payload.providerEventId || payload.providerReference || "missing-reference";
  return `${provider}:${eventReference}:${payload.status}`;
}

/**
 * M5: classifies a webhook processing failure as permanent (a bug that retrying
 * will never fix — the provider should NOT be asked to retry) vs transient
 * (a dependency hiccup worth retrying).
 *
 * Permanent failures are answered with a 4xx and the idempotency claim is NOT
 * released (or is marked processed), so Xendit stops retrying a delivery that
 * can never succeed. Transient failures (DB/Redis) are answered 5xx and the
 * claim is released so the provider's retry re-processes.
 */
function isPermanentWebhookError(error: unknown): boolean {
  if (error instanceof PaymentNotFoundError) return true;
  const message = error instanceof Error ? error.message : String(error);
  // `mapXenditStatus` throws "Unknown payment status: <status>" for a status we
  // don't understand — a permanent provider-side bug, not a transient failure.
  return message.toLowerCase().includes("unknown payment status");
}

function permanentWebhookStatus(error: unknown): number {
  if (error instanceof PaymentNotFoundError) return 404;
  return 400;
}

export function stubCheckoutEnabled(
  nodeEnv: string,
  provider: string,
  allowed: boolean,
): boolean {
  // The stub checkout is a dev/test affordance: never in production-like
  // environments (production + staging), even when STUB_WEBHOOK_ALLOWED=true.
  return !isProductionLike(nodeEnv) && provider === "stub" && allowed === true;
}

export function ipAllowed(
  request: Request,
  allowlist: string[],
  trustProxy: boolean,
  server?: { requestIP(request: Request): { address: string } | null },
): boolean {
  if (allowlist.length === 0) return true;
  const ip = getClientIp(request, trustProxy, server);
  return allowlist.some((entry) => entry === ip);
}

export function validateWebhookTimestamp(
  request: Request,
  provider: string,
): void {
  // L4: Xendit documents only the `x-callback-token` header on its webhooks —
  // there is no reliable `Date`/`x-timestamp` header to validate against, so
  // the timestamp check is skipped for xendit (verified against a real
  // sandbox event; revisit if Xendit starts sending a timestamp header).
  if (provider === "xendit") return;
  const timestamp =
    request.headers.get("x-timestamp") ?? request.headers.get("date");
  if (!timestamp) {
    throw new Error("Webhook timestamp header is required");
  }
  const webhookTime = new Date(timestamp).getTime();
  if (Number.isNaN(webhookTime)) {
    throw new Error("Invalid webhook timestamp");
  }
  if (Math.abs(Date.now() - webhookTime) > MAX_WEBHOOK_AGE_MS) {
    throw new Error("Webhook timestamp too old or too far in the future");
  }
}

export function paymentsWebhook(app: Elysia) {
  app.post(
    "/webhooks/payments/:provider",
    async ({ request, params, set, server }: ElysiaContext) => {
      const provider = params.provider as string;
      const signature =
        provider === "xendit"
          ? (request.headers.get("x-callback-token") ?? "")
          : (request.headers.get("x-webhook-signature") ?? "");

      const { body: rawBody, tooLarge } = await readBodyWithLimit(
        request,
        MAX_WEBHOOK_BODY_BYTES,
      );
      if (tooLarge) {
        set.status = 413;
        return { error: "Request body too large" };
      }

      const allowlist = (env.WEBHOOK_ALLOWED_IPS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        !ipAllowed(request, allowlist, env.TRUST_PROXY, server ?? undefined)
      ) {
        set.status = 403;
        return { error: "Forbidden" };
      }

      log({
        level: "info",
        action: "webhook_received",
        provider,
        contentLength: request.headers.get("content-length"),
        hasSignature: !!signature,
      });

      try {
        const payload = await services.payment.provider.verifyWebhook(
          rawBody,
          signature,
        );

        validateWebhookTimestamp(request, provider);

        // L1: an event with neither a provider event id nor a provider reference
        // cannot be matched to a payment and would otherwise collapse onto the
        // shared `xendit:no-event-id` idempotency key, hiding real delivery
        // failures. Reject it as a permanent 400 with a log instead.
        if (!payload.providerEventId && !payload.providerReference) {
          log({
            level: "error",
            action: "webhook_missing_reference",
            provider,
            error: {
              message:
                "Webhook event has neither a provider event id nor a provider reference",
            },
          });
          set.status = 400;
          return { error: "Webhook event is missing a payment reference" };
        }

        // Xendit identifies lifecycle notifications with a payment or
        // payment-request id rather than a unique delivery id. Include status
        // so PENDING and PAID for one payment both run, while retries of the
        // same lifecycle event remain idempotent. If an event id is absent,
        // isolate the claim by the provider payment reference.
        const idempotencyKey = paymentWebhookIdempotencyKey(provider, payload);
        // Short 2-minute claim window (R7): a crash mid-processing only blocks
        // retries for 2 minutes instead of the 24h processed-record TTL, so the
        // provider's retry can re-process after a crash. `markProcessed` below
        // still stores the 24h processed record for real duplicates.
        if (!(await webhookIdempotency.claim(idempotencyKey, 120))) {
          set.status = 200;
          return { ok: true, idempotent: true };
        }

        try {
          await services.payment.confirmFromWebhook({
            provider: params.provider as string,
            providerReference: payload.providerReference,
            providerEventId: payload.providerEventId,
            status: payload.status,
            receiptUrl: payload.receiptUrl,
            failureReason: payload.failureReason,
          });

          await webhookIdempotency.markProcessed(idempotencyKey, { ok: true });

          set.status = 200;
          return { ok: true };
        } catch (error) {
          // M5: release the claim ONLY on transient errors so the provider's
          // retry re-processes. For permanent errors mark the event processed
          // (dead-letter) so it does not loop against Xendit forever.
          if (isPermanentWebhookError(error)) {
            await webhookIdempotency.markProcessed(idempotencyKey, {
              ok: false,
              permanent: true,
            });
          } else {
            await webhookIdempotency.release(idempotencyKey);
          }
          throw error;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (
          message.toLowerCase().includes("signature") ||
          message.toLowerCase().includes("unauthorized")
        ) {
          log({
            level: "error",
            action: "webhook_signature_failed",
            provider,
            error: { message },
          });
          set.status = 401;
          return { error: "Invalid webhook signature" };
        }

        if (message.toLowerCase().includes("timestamp")) {
          log({
            level: "warn",
            action: "webhook_timestamp_rejected",
            provider,
            error: { message },
          });
          set.status = 408;
          return { error: message };
        }

        // M5: permanent failures (payment not found, unknown status) are a 4xx
        // dead-letter — the provider should stop retrying. Only transient
        // errors (DB/Redis) are a 5xx that Xendit retries.
        if (isPermanentWebhookError(error)) {
          log({
            level: "error",
            action: "webhook_dead_letter",
            provider,
            error: { message },
          });
          set.status = permanentWebhookStatus(error);
          return { error: message };
        }

        log({
          level: "error",
          action: "webhook_processing_error",
          provider,
          error: { message },
        });
        set.status = 500;
        return { error: "Webhook processing failed" };
      }
    },
    { parse: "none" },
  );

  app.get("/webhooks/payments/stub/checkout", async ({ query, set }) => {
    if (
      !stubCheckoutEnabled(
        env.NODE_ENV,
        env.PAYMENT_PROVIDER,
        env.STUB_WEBHOOK_ALLOWED,
      )
    ) {
      set.status = 404;
      return { error: "Not found" };
    }

    const ref = query.ref as string;
    const eventId = "evt_" + crypto.randomUUID();

    await services.payment.confirmFromWebhook({
      provider: "stub",
      providerReference: ref,
      providerEventId: eventId,
      status: "PAID",
    });

    set.status = 200;
    return {
      ok: true,
      providerReference: ref,
      eventId,
    };
  });

  return app;
}
