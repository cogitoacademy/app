import { Elysia, type Context as ElysiaContext } from "elysia";
import { services } from "@cogito-app/api";

export function paymentsWebhook(app: Elysia) {
  app.post(
    "/webhooks/payments/:provider",
    async ({ request, body, params, set }: ElysiaContext) => {
      const provider = params.provider as string;
      const signature =
        provider === "xendit"
          ? (request.headers.get("x-callback-token") ?? "")
          : (request.headers.get("x-webhook-signature") ?? "");
      const rawBody = typeof body === "string" ? body : JSON.stringify(body);

      try {
        const payload = await services.payment.provider.verifyWebhook(
          rawBody,
          signature,
        );

        await services.payment.confirmFromWebhook({
          provider: params.provider as string,
          providerReference: payload.providerReference,
          providerEventId: payload.providerEventId,
          status: payload.status,
          receiptUrl: payload.receiptUrl,
          failureReason: payload.failureReason,
        });

        set.status = 200;
        return { ok: true };
      } catch {
        set.status = 401;
        return { error: "Invalid webhook signature" };
      }
    },
    { parse: "text" },
  );

  app.get("/webhooks/payments/stub/checkout", async ({ query, set }) => {
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
