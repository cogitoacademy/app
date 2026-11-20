import { asc, desc, eq, inArray } from "drizzle-orm";

import {
  calendarEvent,
  calendarEventCategory,
  subjectCategory,
  tutorProfile,
} from "@cogito-app/db/schema";
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

export type PublicCalendarCategoryRow = {
  id: string;
  slug: string;
  name: string;
  lightTextColor: string | null;
  lightBackgroundColor: string | null;
  darkTextColor: string | null;
  darkBackgroundColor: string | null;
};

export type PublicCalendarEventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startDate: Date;
  endDate: Date;
  educationLevels: string[];
  scale: string | null;
  organizer: string | null;
  registrationDeadline: Date | null;
  registrationLink: string | null;
  socialMediaLink: string | null;
  categories: PublicCalendarCategoryRow[];
};

async function listActiveCalendarEvents(db: DbType) {
  const events = await db
    .select({
      // Positive allowlist: source hashes, versions, audit columns and
      // Knowledge Bank data are never selected here.
      id: calendarEvent.id,
      title: calendarEvent.title,
      description: calendarEvent.description,
      location: calendarEvent.location,
      startDate: calendarEvent.startDate,
      endDate: calendarEvent.endDate,
      educationLevels: calendarEvent.educationLevels,
      scale: calendarEvent.scale,
      organizer: calendarEvent.organizer,
      registrationDeadline: calendarEvent.registrationDeadline,
      registrationLink: calendarEvent.registrationLink,
      socialMediaLink: calendarEvent.socialMediaLink,
    })
    .from(calendarEvent)
    .where(eq(calendarEvent.isActive, true))
    .orderBy(asc(calendarEvent.startDate), asc(calendarEvent.id));

  if (events.length === 0) return [];

  const categories = await db
    .select({
      eventId: calendarEventCategory.eventId,
      id: subjectCategory.id,
      slug: subjectCategory.slug,
      name: subjectCategory.name,
      lightTextColor: subjectCategory.lightTextColor,
      lightBackgroundColor: subjectCategory.lightBackgroundColor,
      darkTextColor: subjectCategory.darkTextColor,
      darkBackgroundColor: subjectCategory.darkBackgroundColor,
    })
    .from(calendarEventCategory)
    .innerJoin(
      subjectCategory,
      eq(calendarEventCategory.categoryId, subjectCategory.id),
    )
    .where(
      inArray(
        calendarEventCategory.eventId,
        events.map((event) => event.id),
      ),
    )
    .orderBy(asc(subjectCategory.sortOrder), asc(subjectCategory.id));

  const categoriesByEvent = new Map<string, PublicCalendarCategoryRow[]>();
  for (const event of events) categoriesByEvent.set(event.id, []);
  for (const { eventId, ...category } of categories) {
    // The category query is restricted to the selected event IDs.
    categoriesByEvent.get(eventId)!.push(category);
  }

  return events.map((event): PublicCalendarEventRow => ({
    ...event,
    categories: categoriesByEvent.get(event.id)!,
  }));
}

export function createPublicContentRepo(db: DbType) {
  return {
    listPublishedTutors() {
      return listPublishedTutors(db);
    },
    listActiveCalendarEvents() {
      return listActiveCalendarEvents(db);
    },
  };
}

export type PublicContentRepo = ReturnType<typeof createPublicContentRepo>;
export type PublicTutorRow = Awaited<
  ReturnType<PublicContentRepo["listPublishedTutors"]>
>[number];
