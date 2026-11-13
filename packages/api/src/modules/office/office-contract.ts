import { z } from "zod";
import { computeSlaDeadline } from "../support/support.service";

export const OFFICE_OPEN_BOOKING_STATES = [
  "awaiting_tutor_review",
  "reschedule_proposed",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
  "confirmed",
  "scheduled",
] as const;

export function officeEscalationDeadline(
  state: string,
  meta: unknown,
  now: Date,
) {
  if (!OFFICE_OPEN_BOOKING_STATES.some((open) => open === state)) return null;
  const at = (meta as { overriddenAt?: unknown } | null)?.overriddenAt;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return null;
  const deadline = computeSlaDeadline(new Date(at));
  return deadline <= now ? deadline : null;
}

// Explicit response projection: referral rows also contain private partner/bank fields.
export const officeKolResultSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  campaignType: z.enum(["internal", "kol"]).optional(),
  activationAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  attributionWindowDays: z.number(),
  flatAmountIdr: z.number(),
  percentBps: z.number(),
  pausedAt: z.coerce.date().nullable(),
  retiredAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date().optional(),
});

export function officeActionAppUrl(name: string, id: string) {
  if (name.startsWith("referrals."))
    return "https://app.cogitoacademy.id/admin-referrals";
  if (name.startsWith("blog."))
    return `https://app.cogitoacademy.id/admin-blog/${encodeURIComponent(id)}`;
  if (name.startsWith("faq.")) return "https://app.cogitoacademy.id/faq";
  if (name.startsWith("activities."))
    return "https://app.cogitoacademy.id/activities";
  if (name.startsWith("calendar."))
    return "https://app.cogitoacademy.id/calendar";
  return "https://app.cogitoacademy.id/knowledge-bank";
}
