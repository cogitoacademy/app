import { Elysia, type Context as ElysiaContext } from "elysia";
import { services } from "@cogito-app/api";
import { webhookIdempotency } from "@cogito-app/api/lib/idempotency";
import { log } from "@cogito-app/api/lib/logger";
import { getClientIp, readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import { env } from "@cogito-app/env/server";

const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export function stubCheckoutEnabled(
  nodeEnv: string,
  provider: string,
  allowed: boolean,
): boolean {
  return nodeEnv !== "production" && provider === "stub" && allowed === true;
}

export function ipAllowed(
  request: Request,
  allowlist: string[],
  trustProxy: boolean,
): boolean {
  if (allowlist.length === 0) return true;
  const ip = getClientIp(request, trustProxy);
  return allowlist.some((entry) => entry === ip);
}

function validateWebhookTimestamp(request: Request): void {
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
    async ({ request, params, set }: ElysiaContext) => {
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
      if (!ipAllowed(request, allowlist, env.TRUST_PROXY)) {
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

        validateWebhookTimestamp(request);

        const idempotencyKey = `${provider}:${payload.providerEventId || "no-event-id"}`;
        if (!(await webhookIdempotency.claim(idempotencyKey))) {
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
          await webhookIdempotency.release(idempotencyKey);
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
