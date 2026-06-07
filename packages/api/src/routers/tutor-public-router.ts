import { z } from "zod";
import { eq, desc, and, SQL } from "drizzle-orm";
import { createDb } from "@cogito-app/db";
import { tutorProfile } from "@cogito-app/db/schema";
import { protectedProcedure } from "../index";

const db = createDb();

export const tutorPublicRouter = {
  listPublished: protectedProcedure
    .route({
      method: "POST",
      path: "/tutors/list",
      tags: ["Tutors"],
      summary: "List published tutors",
      description:
        "Returns published tutor profiles with optional search and filters",
    })
    .input(
      z.object({
        search: z.string().optional(),
        expertise: z.string().optional(),
        modality: z.enum(["online", "offline", "both"]).optional(),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional(),
    )
    .handler(async ({ input }) => {
      const search = input?.search;
      const expertise = input?.expertise;
      const modality = input?.modality;
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const conditions: SQL<unknown>[] = [
        eq(tutorProfile.onboardingStatus, "published"),
      ];

      if (modality) {
        conditions.push(eq(tutorProfile.modality, modality));
      }

      const profiles = await db.query.tutorProfile.findMany({
        where: and(...conditions),
        orderBy: [desc(tutorProfile.publishedAt)],
        limit,
        offset,
        with: {
          user: true,
        },
      });

      let filtered = profiles;

      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.displayName?.toLowerCase().includes(q) ||
            p.shortBio?.toLowerCase().includes(q) ||
            p.credentialsSummary?.toLowerCase().includes(q),
        );
      }

      if (expertise) {
        filtered = filtered.filter(
          (p) =>
            p.expertise?.some((e: string) =>
              e.toLowerCase() === expertise.toLowerCase(),
            ),
        );
      }

      return filtered.map((p) => ({
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
        user: p.user
          ? { name: p.user.name, image: p.user.image }
          : null,
      }));
    }),
};