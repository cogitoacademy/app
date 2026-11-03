import { z } from "zod";

const filterText = (max: number) =>
  z.string().trim().min(1).max(max).optional();

export const listAuditLogsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(120).optional(),
  action: filterText(100),
  targetType: filterText(100),
  targetId: z.string().trim().max(100).optional(),
  actorId: z.string().trim().max(100).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

export type ListAuditLogsInput = z.infer<typeof listAuditLogsInput>;
