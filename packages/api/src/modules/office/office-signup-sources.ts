import { sql } from "drizzle-orm";
import { db } from "../../lib/db";

export async function getOfficeSignupSources(start: Date, end: Date) {
  const result = await db.execute(sql`
    SELECT COALESCE(u.signup_source->>'manual', u.signup_source->'firstTouch'->>'utm_source', 'direct') AS source,
      COALESCE(u.signup_source->'firstTouch'->>'utm_campaign', '') AS campaign,
      count(*)::int AS registered,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payment_record p WHERE p.user_id = u.id AND p.status IN ('PAID','SETTLED')))::int AS "paidTopUp"
    FROM "user" u WHERE u.created_at >= ${start.toISOString()}::timestamptz AND u.created_at < ${end.toISOString()}::timestamptz
    GROUP BY 1,2 ORDER BY 1,2
  `);
  return projectOfficeSignupSources(result);
}

export function projectOfficeSignupSources(
  result: Iterable<Record<string, unknown>>,
) {
  const groups = new Map<
    string,
    { source: string; campaign: string; registered: number; paidTopUp: number }
  >();
  for (const row of result) {
    const source =
      typeof row.source === "string" &&
      [
        "direct",
        "instagram",
        "facebook",
        "google",
        "whatsapp",
        "school",
        "event",
        "friend",
        "other",
      ].includes(row.source)
        ? row.source
        : "other";
    const campaign = row.campaign === "test" ? row.campaign : "";
    const key = JSON.stringify([source, campaign]);
    const group = groups.get(key) ?? {
      source,
      campaign,
      registered: 0,
      paidTopUp: 0,
    };
    group.registered += Number(row.registered);
    group.paidTopUp += Number(row.paidTopUp);
    groups.set(key, group);
  }
  return [...groups.values()];
}
