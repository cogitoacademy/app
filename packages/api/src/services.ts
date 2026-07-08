import { db } from "./lib/db";
import { createAuditRepo } from "./modules/audit/audit.repo";
import { createAuditHandler } from "./modules/audit/audit.handler";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletRepo } from "./modules/wallet/wallet.repo";
import { createWalletHandler } from "./modules/wallet/wallet.handler";
import { createAuthRepo } from "./modules/auth/auth.repo";
import { createAuthHandler } from "./modules/auth/auth.handler";
import { createAdminRepo } from "./modules/admin/admin.repo";
import { createAdminHandler } from "./modules/admin/admin.handler";
import { createAdminTutorRepo } from "./modules/admin-tutor/admin-tutor.repo";
import { createAdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import { createTutorRepo } from "./modules/tutor/tutor.repo";
import { createTutorHandler } from "./modules/tutor/tutor.handler";
import { createDiscoveryRepo } from "./modules/tutor-discovery/discovery.repo";
import { createDiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import { createInviteRepo } from "./modules/invite/invite.repo";
import { createInviteHandler } from "./modules/invite/invite.handler";
import { createAchievementRepo } from "./modules/achievement/achievement.repo";
import { createAchievementHandler } from "./modules/achievement/achievement.handler";

import type { AuditPort } from "./shared/ports/audit.port";
import type { PricingPort } from "./shared/ports/pricing.port";
import type { WalletPort } from "./shared/ports/wallet.port";
import type { AuthHandler } from "./modules/auth/auth.handler";
import type { AdminHandler } from "./modules/admin/admin.handler";
import type { AdminTutorHandler } from "./modules/admin-tutor/admin-tutor.handler";
import type { TutorHandler } from "./modules/tutor/tutor.handler";
import type { DiscoveryHandler } from "./modules/tutor-discovery/discovery.handler";
import type { InviteHandler } from "./modules/invite/invite.handler";
import type { AchievementHandler } from "./modules/achievement/achievement.handler";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  auth: AuthHandler;
  admin: AdminHandler;
  adminTutor: AdminTutorHandler;
  tutor: TutorHandler;
  discovery: DiscoveryHandler;
  invite: InviteHandler;
  achievement: AchievementHandler;
}

function createServices(): ServiceRegistry {
  const auditRepo = createAuditRepo();
  const audit = createAuditHandler(auditRepo);
  const pricing = createPricingService();
  const wallet = createWalletHandler(createWalletRepo(db));

  const authRepo = createAuthRepo();
  const auth = createAuthHandler({ authRepo, walletPort: wallet });

  const adminRepo = createAdminRepo();
  const admin = createAdminHandler({ adminRepo, auditPort: audit });

  const adminTutorRepo = createAdminTutorRepo();
  const adminTutor = createAdminTutorHandler({
    adminTutorRepo,
    auditPort: audit,
    db,
  });

  const tutorRepo = createTutorRepo();
  const tutor = createTutorHandler({
    tutorRepo,
    pricingPort: pricing,
    auditPort: audit,
    db,
  });

  const discoveryRepo = createDiscoveryRepo();
  const discovery = createDiscoveryHandler({ discoveryRepo, db });

  const inviteRepo = createInviteRepo();
  const invite = createInviteHandler({ inviteRepo, auditPort: audit, db });

  const achievementRepo = createAchievementRepo();
  const achievement = createAchievementHandler({
    achievementRepo,
    auditPort: audit,
    db,
  });

  return {
    audit,
    pricing,
    wallet,
    auth,
    admin,
    adminTutor,
    tutor,
    discovery,
    invite,
    achievement,
  };
}

export const services = createServices();
