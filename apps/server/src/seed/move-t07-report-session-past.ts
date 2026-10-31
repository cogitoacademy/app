import { and, eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { academyClass, academyClassSession } from "@cogito-app/db/schema";

function assertT07TestTarget(env: NodeJS.ProcessEnv) {
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("T07 report fixture movement requires test DB 6769.");
  }
  const host = url.hostname.toLowerCase();
  if (
    env.NODE_ENV !== "test" ||
    env.T05_ENROLLMENT_TEST_DB_PORT !== "6769" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) ||
    url.port !== "6769" ||
    url.pathname !== "/cogito-test"
  ) {
    throw new Error(
      "T07 report fixture movement requires loopback 6769/cogito-test.",
    );
  }
}

export async function moveT07ReportSessionPast(
  classId: string,
  sessionId: string,
) {
  assertT07TestTarget(process.env);
  if (!/^[\da-f-]{36}$/i.test(classId) || !/^[\da-f-]{36}$/i.test(sessionId)) {
    throw new Error(
      "T07 report fixture movement requires class and session UUIDs.",
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    const [classRow] = await tx
      .select({ title: academyClass.titleEn, state: academyClass.state })
      .from(academyClass)
      .where(eq(academyClass.id, classId))
      .limit(1);
    if (
      !classRow?.title.startsWith("T07 report E2E ") ||
      classRow.state !== "published"
    ) {
      throw new Error("T07 report fixture class was not found or published.");
    }

    const updated = await tx
      .update(academyClassSession)
      .set({
        startAt: new Date(now.getTime() - 2 * 60 * 60_000),
        endAt: new Date(now.getTime() - 60 * 60_000),
        updatedAt: now,
      })
      .where(
        and(
          eq(academyClassSession.id, sessionId),
          eq(academyClassSession.classId, classId),
          eq(academyClassSession.state, "scheduled"),
        ),
      )
      .returning({ id: academyClassSession.id });
    if (updated.length !== 1) {
      throw new Error("T07 report fixture session was not scheduled.");
    }
  });
}

if (import.meta.main) {
  const [classId, sessionId] = process.argv.slice(2);
  if (!classId || !sessionId) {
    throw new Error(
      "Usage: move-t07-report-session-past.ts <classId> <sessionId>",
    );
  }
  moveT07ReportSessionPast(classId, sessionId)
    .then(() =>
      console.log("T07 owned report fixture session moved to the past."),
    )
    .catch(() => {
      console.error(
        "T07 report fixture movement failed; no non-test target is permitted.",
      );
      process.exit(1);
    });
}
