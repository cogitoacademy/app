import { z } from "zod";

export const ADMIN_PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "SETTLED",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
] as const;

export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

const userId = z.string().trim().min(1).max(100);
const isoDateTime = z.string().trim().datetime({ offset: true });

export const adminListPaymentsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(200).optional(),
  status: z.enum(ADMIN_PAYMENT_STATUSES).optional(),
  userId: userId.optional(),
  query: z.string().trim().min(2).max(100).optional(),
  dateFrom: isoDateTime.optional(),
  dateTo: isoDateTime.optional(),
});

export type AdminListPaymentsInput = z.input<typeof adminListPaymentsInput>;

export type AdminPaymentRefundKind = "partial" | "full";

export type AdminPaymentListItem = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amountIdr: number;
  marks: number;
  status: AdminPaymentStatus;
  provider: string;
  providerReference: string;
  purchaseLabel: string | null;
  createdAt: string;
  providerSuccessAt: string | null;
  providerRefundKind: AdminPaymentRefundKind | null;
  providerRefundAmountIdr: number | null;
};

export type AdminListPaymentsResult = {
  items: AdminPaymentListItem[];
  nextCursor: string | null;
  total: number;
};
