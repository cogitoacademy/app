import { DEFAULT_V3_ECONOMY_CONFIG } from "@cogito-app/api/modules/pricing/v3-economy.config";
import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import { seedAllowed } from "./seed";

export function seedPackagesAllowed(
  nodeEnv: string,
  allowFlag: string | undefined,
): boolean {
  return seedAllowed(nodeEnv, allowFlag);
}

const PACKAGE_NAMES: Record<string, string> = {
  starter: "Starter Pack",
  learner: "Learner Pack",
  explorer: "Explorer Pack",
  pioneer: "Pioneer Pack",
};
export const PACKAGES = DEFAULT_V3_ECONOMY_CONFIG.packages.map((pkg) => ({
  ...pkg,
  name: PACKAGE_NAMES[pkg.code] ?? pkg.code,
}));

export async function seedPackages() {
  await Promise.all(
    PACKAGES.map((pkg) =>
      db.insert(markPackage).values(pkg).onConflictDoNothing({
        target: markPackage.code,
      }),
    ),
  );
  console.log("Seeded mark packages");
}

if (import.meta.main) {
  // W2: mirror the seed.ts production guard — `seed-packages` must never be
  // runnable against a prod-like database unless the operator explicitly
  // opted in with SEED_ALLOWED_IN_PROD=true (RUNBOOK promises this exits
  // with an error in production).
  if (!seedPackagesAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
    console.error(
      "Refusing to seed packages in production/staging unless SEED_ALLOWED_IN_PROD=true",
    );
    process.exit(1);
  }
  await seedPackages();
  process.exit(0);
}
