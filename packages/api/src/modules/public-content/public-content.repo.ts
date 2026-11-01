import { asc, desc, eq } from "drizzle-orm";

import { tutorProfile } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";

async function listPublishedTutors(db: DbType) {
  return db.query.tutorProfile.findMany({
    // Keep this as a positive allowlist. Adding a database column must never
    // make that column public by default.
    columns: {
      id: true,
      shortBio: true,
      affiliation: true,
      education: true,
      achievements: true,
      experiences: true,
      modality: true,
    },
    where: eq(tutorProfile.onboardingStatus, "published"),
    orderBy: [desc(tutorProfile.publishedAt), asc(tutorProfile.id)],
    with: {
      user: {
        columns: {
          name: true,
          image: true,
        },
      },
      subjects: {
        columns: {
          subjectId: true,
        },
        with: {
          subject: {
            columns: {
              id: true,
              slug: true,
              name: true,
              nameId: true,
              parentId: true,
              isActive: true,
            },
            with: {
              parent: {
                columns: {
                  id: true,
                  slug: true,
                  name: true,
                  nameId: true,
                  parentId: true,
                  isActive: true,
                  lightTextColor: true,
                  lightBackgroundColor: true,
                  darkTextColor: true,
                  darkBackgroundColor: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export function createPublicContentRepo(db: DbType) {
  return {
    listPublishedTutors() {
      return listPublishedTutors(db);
    },
  };
}

export type PublicContentRepo = ReturnType<typeof createPublicContentRepo>;
export type PublicTutorRow = Awaited<
  ReturnType<PublicContentRepo["listPublishedTutors"]>
>[number];
