import { eq, desc, and, gte, sql, type SQL } from "drizzle-orm";
import { tutorProfile, availabilitySlot } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";

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

  async function upcomingSlots(tutorUserId: string, limit = 3) {
    const now = new Date();
    return db
      .select()
      .from(availabilitySlot)
      .where(
        and(
          eq(availabilitySlot.tutorId, tutorUserId),
          eq(availabilitySlot.isActive, true),
          gte(availabilitySlot.startDate, now),
        ),
      )
      .orderBy(availabilitySlot.startDate)
      .limit(limit);
  }

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

    const results = [];
    for (const p of profiles) {
      const slots = await upcomingSlots(p.userId);
      results.push({
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
        upcomingSlots: slots,
      });
    }
    return results;
  }

  async function getProfile(tutorId: string) {
    const profile = await db.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.id, tutorId),
        eq(tutorProfile.onboardingStatus, "published"),
      ),
      with: { user: true },
    });
    if (!profile) throw notFound("Tutor profile not found");

    const now = new Date();
    const slots = await db
      .select()
      .from(availabilitySlot)
      .where(
        and(
          eq(availabilitySlot.tutorId, profile.userId),
          eq(availabilitySlot.isActive, true),
          gte(availabilitySlot.startDate, now),
        ),
      )
      .orderBy(availabilitySlot.startDate);

    return { ...profile, slots };
  }

  return { listPublished, getProfile };
}
