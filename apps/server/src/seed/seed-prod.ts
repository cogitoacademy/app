#!/usr/bin/env bun
/**
 * Production/staging seed.
 *
 * Inserts canonical content only: Marks packages, blog taxonomy, FAQ,
 * competition taxonomy and calendar, and the default V3 economy revision.
 * It never creates admin, tutor, or student accounts, and it needs no seed
 * passwords.
 *
 * Admins come from the configured allowlist: sign in with an address from
 * `ADMIN_EMAILS` (or a fixed super-admin address) and the signup hook or
 * server boot promotes that account.
 *
 * Required in production-like envs:
 *   SEED_ALLOWED_IN_PROD=true
 */
import { env } from "@cogito-app/env/server";

import { seedAllowed, seedCanonicalContent } from "./seed";

export async function seedProduction() {
  if (!seedAllowed(env.NODE_ENV, process.env.SEED_ALLOWED_IN_PROD)) {
    throw new Error(
      "Refusing to seed in production/staging unless SEED_ALLOWED_IN_PROD=true",
    );
  }

  await seedCanonicalContent(null);
  console.log("Production seed ready: canonical defaults only");
}

if (import.meta.main) {
  seedProduction().catch((err) => {
    console.error("Production seed failed:", err);
    process.exit(1);
  });
}
