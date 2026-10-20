import { and, eq, inArray, like } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { user, verification } from "@cogito-app/db/schema";

function assertDedicatedTestDatabase() {
  let databaseUrl: URL | undefined;
  try {
    databaseUrl = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL)
      : undefined;
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    !["postgres:", "postgresql:"].includes(databaseUrl?.protocol ?? "") ||
    databaseUrl?.pathname.replace(/^\/+/, "") !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase().replace(/^\[|\]$/g, "") ?? "",
    )
  ) {
    throw new Error(
      "Signup E2E cleanup requires NODE_ENV=test and the local cogito-test database.",
    );
  }
}

async function cleanup() {
  assertDedicatedTestDatabase();
  const [email] = process.argv.slice(2);
  const fixtureEmail =
    /^e2e\.signup\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@cogito\.test$/i;
  if (!email || !fixtureEmail.test(email)) {
    throw new Error("Signup E2E cleanup requires its synthetic email.");
  }

  try {
    await db.delete(user).where(eq(user.email, email));
    await db
      .delete(verification)
      .where(
        inArray(verification.identifier, [
          `pre-account-signup-otp:${email}`,
          `email-verification-otp-${email}`,
        ]),
      );
    await db
      .delete(verification)
      .where(
        and(
          like(verification.identifier, "pre-account-signup-outcome:%"),
          eq(verification.value, email),
        ),
      );
    const [remainingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    const remainingProof = await db
      .select({ id: verification.id })
      .from(verification)
      .where(
        inArray(verification.identifier, [
          `pre-account-signup-otp:${email}`,
          `email-verification-otp-${email}`,
        ]),
      );
    const remainingOutcome = await db
      .select({ id: verification.id })
      .from(verification)
      .where(
        and(
          like(verification.identifier, "pre-account-signup-outcome:%"),
          eq(verification.value, email),
        ),
      );
    if (
      remainingUser ||
      remainingProof.length > 0 ||
      remainingOutcome.length > 0
    ) {
      throw new Error("Signup E2E cleanup left test records behind.");
    }
    console.log(
      "Signup E2E cleanup verified: fixture user and OTP records removed.",
    );
  } finally {
    await db.$client.end();
  }
}

cleanup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
