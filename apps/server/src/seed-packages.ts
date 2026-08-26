import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import { seedAllowed } from "./seed";

export const PACKAGES = [
  { code: "starter", name: "Starter Pack", marks: 50, priceIdr: 312500 },
  { code: "learner", name: "Learner Pack", marks: 120, priceIdr: 690000 },
  { code: "explorer", name: "Explorer Pack", marks: 200, priceIdr: 1070000 },
  { code: "pioneer", name: "Pioneer Pack", marks: 400, priceIdr: 2000000 },
];

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
  if (!seedAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
    console.error(
      "Refusing to seed packages in production/staging unless SEED_ALLOWED_IN_PROD=true",
    );
    process.exit(1);
  }
  await seedPackages();
  process.exit(0);
}
