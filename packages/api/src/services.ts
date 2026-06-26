import { db } from "./lib/db";
import { createAuditService } from "./modules/audit/audit.service";
import { createPricingService } from "./modules/pricing/pricing.service";
import { createWalletService } from "./modules/wallet/wallet.service";
import { createAuthService } from "./modules/auth/auth.service";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import { createTutorService } from "./modules/tutor/tutor.service";
import { createDiscoveryService } from "./modules/tutor-discovery/discovery.service";
import { createInviteService } from "./modules/invite/invite.service";
import { createAchievementService } from "./modules/achievement/achievement.service";
import { createPaymentService } from "./modules/payment/payment.service";
import { createStubPaymentProvider } from "./modules/payment/stub-payment.provider";
import { env } from "@cogito-app/env/server";

import type { AuditPort } from "./shared/ports/audit.port";
import type { PricingPort } from "./shared/ports/pricing.port";
import type { WalletPort } from "./shared/ports/wallet.port";
import type { AuthService } from "./modules/auth/auth.service";
import type { AdminService } from "./modules/admin/admin.service";
import type { AdminTutorService } from "./modules/admin-tutor/admin-tutor.service";
import type { TutorService } from "./modules/tutor/tutor.service";
import type { DiscoveryService } from "./modules/tutor-discovery/discovery.service";
import type { InviteService } from "./modules/invite/invite.service";
import type { AchievementService } from "./modules/achievement/achievement.service";
import type { PaymentService } from "./modules/payment/payment.service";

export interface ServiceRegistry {
  audit: AuditPort;
  pricing: PricingPort;
  wallet: WalletPort;
  auth: AuthService;
  admin: AdminService;
  adminTutor: AdminTutorService;
  tutor: TutorService;
  discovery: DiscoveryService;
  invite: InviteService;
  achievement: AchievementService;
  payment: PaymentService;
}

function createServices(): ServiceRegistry {
  const audit = createAuditService();
  const pricing = createPricingService();
  const wallet = createWalletService(db);
  const auth = createAuthService({ db, wallet });
  const admin = createAdminService({ db, audit });
  const adminTutor = createAdminTutorService({ db, audit });
  const tutor = createTutorService({ db, pricing, audit });
  const discovery = createDiscoveryService({ db });
  const invite = createInviteService({ db, audit });
  const achievement = createAchievementService({ db, audit });
  const paymentProvider = createStubPaymentProvider(env.PAYMENT_WEBHOOK_SECRET);
  const payment = createPaymentService({
    db,
    wallet,
    provider: paymentProvider,
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
    payment,
  };
}

export const services = createServices();
