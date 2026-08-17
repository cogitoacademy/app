import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import type { NotificationWriteParams } from "../notification/notification.service";
import { createAchievementRepo } from "./achievement.repo";
import { createAchievementService } from "./achievement.service";
import { createAchievementHandler } from "./achievement.handler";
import type { AchievementService } from "./achievement.service";
import type { AchievementHandler } from "./achievement.handler";

export type AchievementModule = ReturnType<typeof createAchievementModule>;

export interface AchievementAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface AchievementNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export function createAchievementModule(deps: {
  db: DbType;
  audit: AchievementAuditPort;
  notification: AchievementNotificationPort;
}) {
  const repo = createAchievementRepo();
  const service = createAchievementService({
    achievementRepo: repo,
    auditPort: deps.audit,
    notificationPort: deps.notification,
    db: deps.db,
  });
  const handler = createAchievementHandler({ achievementService: service });
  return { service, handler };
}

export type { AchievementService, AchievementHandler };
