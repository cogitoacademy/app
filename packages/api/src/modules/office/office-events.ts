import { createHmac } from "node:crypto";
import type { DbOrTx } from "../../lib/tx";
import { officeOutbox } from "@cogito-app/db/schema";

export const OFFICE_EVENT_TYPES = [
  "booking.exception_opened",
  "booking.escalated",
  "booking.cancelled",
  "ticket.opened",
  "ticket.sla_warning",
  "ticket.sla_breached",
  "room.approval_pending",
  "tutor.invitation_claimed",
  "tutor.application_submitted",
  "tutor.profile_published",
  "achievement.submitted",
  "session_report.overdue",
  "referral.signup",
  "referral.converted",
  "payment.succeeded",
  "payment.refunded",
  "payout.ready",
  "payout.paid",
  "pricing.changed",
  "referral_settings.changed",
  "admin.added",
  "admin.removed",
  "payment_mode.changed",
  "system.job_failed",
] as const;
export type OfficeEventType = (typeof OFFICE_EVENT_TYPES)[number];
const allowedKeys = new Set([
  "id",
  "ref",
  "state",
  "count",
  "amountIdr",
  "appUrl",
]);
export function officeEventPayload(value: Record<string, unknown>) {
  const result: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) result[key] = raw;
    if (typeof raw === "string" && raw.length <= 300 && !raw.includes("@")) {
      if (
        key === "appUrl" &&
        !/^https:\/\/app\.cogitoacademy\.id\/[a-zA-Z0-9/_?=&.-]*$/.test(raw)
      )
        continue;
      result[key] = raw;
    }
  }
  return result;
}
export function signOfficeEvent(
  secret: string,
  timestamp: string,
  rawBody: string,
) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}
export async function enqueueOfficeEvent(
  tx: DbOrTx,
  type: OfficeEventType,
  payload: Record<string, unknown>,
  id?: string,
) {
  await tx
    .insert(officeOutbox)
    .values({
      ...(id ? { id } : {}),
      type,
      payload: officeEventPayload(payload),
    })
    .onConflictDoNothing();
}

export async function deliverOfficeEvent(
  row: {
    id: string;
    type: string;
    createdAt: Date;
    payload: Record<string, unknown>;
  },
  options: { url: string; secret: string; fetch?: typeof fetch; now?: Date },
) {
  const raw = JSON.stringify({
    id: row.id,
    type: row.type,
    occurredAt: row.createdAt.toISOString(),
    data: officeEventPayload(row.payload),
  });
  const timestamp = Math.floor(
    (options.now ?? new Date()).getTime() / 1000,
  ).toString();
  const response = await (options.fetch ?? fetch)(options.url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      "X-Cogito-Timestamp": timestamp,
      "X-Cogito-Signature": signOfficeEvent(options.secret, timestamp, raw),
    },
    body: raw,
  });
  if (!response.ok) throw new Error("Office receiver rejected event");
}
