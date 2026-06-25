import { eq, desc, and, sql, type SQL } from "drizzle-orm";
import { tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";

export interface ListPublishedInput {
  search?: string;
  expertise?: string;
  modality?: "online" | "offline" | "both";
  limit?: number;
  offset?: number;
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;

export function createDiscoveryService(deps: { db: DbType }) {
  const { db } = deps;

  async function listPublished(input: ListPublishedInput = {}) {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const conditions: SQL<unknown>[] = [
      eq(tutorProfile.onboardingStatus, "published"),
    ];

    if (input.modality) {
      conditions.push(eq(tutorProfile.modality, input.modality));
    }

    if (input.search) {
      const q = `%${input.search}%`;
      conditions.push(
        sql`(lower(${tutorProfile.displayName}) like lower(${q}) or lower(${tutorProfile.shortBio}) like lower(${q}) or lower(${tutorProfile.credentialsSummary}) like lower(${q}))`,
      );
    }

    if (input.expertise) {
      conditions.push(
        sql`${tutorProfile.expertise} @> ${JSON.stringify([input.expertise])}::jsonb`,
      );
    }

    const profiles = await db.query.tutorProfile.findMany({
      where: and(...conditions),
      orderBy: [desc(tutorProfile.publishedAt)],
      limit,
      offset,
      with: { user: true },
    });

    return profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      shortBio: p.shortBio,
      credentialsSummary: p.credentialsSummary,
      expertise: p.expertise ?? [],
      modality: p.modality,
      prices: p.prices,
      availabilitySummary: p.availabilitySummary,
      proofUrls: p.proofUrls,
      publishedAt: p.publishedAt,
      user: p.user ? { name: p.user.name, image: p.user.image } : null,
    }));
  }

  async function getProfile(tutorId: string) {
    const profile = await db.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.id, tutorId),
        eq(tutorProfile.onboardingStatus, "published"),
      ),
      with: { user: true },
    });
    return profile;
  }

  return { listPublished, getProfile };
}
