import { inArray } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { faqEntry } from "@cogito-app/db/schema";

function assertDedicatedTestDatabase() {
  let databaseUrl: URL | undefined;
  try {
    if (process.env.DATABASE_URL)
      databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    databaseUrl = undefined;
  }

  if (
    process.env.NODE_ENV !== "test" ||
    databaseUrl?.pathname.replace(/^\/+/, "") !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(
      databaseUrl?.hostname.toLowerCase() ?? "",
    )
  ) {
    throw new Error(
      "FAQ E2E cleanup requires NODE_ENV=test and the local cogito-test database.",
    );
  }
}

async function cleanup() {
  assertDedicatedTestDatabase();
  const fixtureIds = process.argv.slice(2);
  if (
    fixtureIds.length === 0 ||
    new Set(fixtureIds).size !== fixtureIds.length ||
    fixtureIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  ) {
    throw new Error("FAQ E2E cleanup requires unique FAQ fixture UUIDs.");
  }

  try {
    const deleted = await db
      .delete(faqEntry)
      .where(inArray(faqEntry.id, fixtureIds))
      .returning({ id: faqEntry.id });
    const remaining = await db
      .select({ id: faqEntry.id })
      .from(faqEntry)
      .where(inArray(faqEntry.id, fixtureIds));
    if (remaining.length > 0) {
      throw new Error(
        `FAQ cleanup left fixture IDs: ${remaining.map(({ id }) => id).join(", ")}`,
      );
    }
    console.log(
      `FAQ cleanup verified: deleted [${deleted.map(({ id }) => id).join(", ")}]; remaining IDs: 0.`,
    );
  } finally {
    await db.$client.end();
  }
}

cleanup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
