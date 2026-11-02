import { inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  calendarEvent,
  calendarEventCategory,
  subjectCategory,
} from "@cogito-app/db/schema";
import { env } from "@cogito-app/env/server";
import { COMPETITION_CALENDAR_SEED } from "./competition-calendar-seed-data";
import { seedAllowed } from "./seed";

export function seedCompetitionCalendarAllowed(
  nodeEnv: string,
  allowFlag: string | undefined,
): boolean {
  return seedAllowed(nodeEnv, allowFlag);
}

async function assertCategoriesExist() {
  const required = [
    ...new Set(COMPETITION_CALENDAR_SEED.flatMap((event) => event.categoryIds)),
  ];
  const existing = await db
    .select({ id: subjectCategory.id })
    .from(subjectCategory)
    .where(inArray(subjectCategory.id, required));
  if (existing.length !== required.length) {
    throw new Error(
      "Calendar seed requires the competition category catalog; seed competition types first",
    );
  }
}

export async function seedCompetitionCalendar() {
  await assertCategoriesExist();
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(calendarEvent)
      .values(
        COMPETITION_CALENDAR_SEED.map((event) => ({
          id: event.id,
          sourceId: event.sourceId,
          title: event.title,
          description: event.description,
          location: event.location,
          startDate: new Date(event.startDate),
          endDate: new Date(event.endDate),
          educationLevels: event.educationLevels,
          scale: event.scale,
          organizer: event.organizer,
          registrationDeadline: event.registrationDeadline
            ? new Date(event.registrationDeadline)
            : null,
          registrationLink: event.registrationLink,
          socialMediaLink: event.socialMediaLink,
          isActive: event.isActive,
          sortOrder: 0,
        })),
      )
      .onConflictDoNothing({ target: calendarEvent.id })
      .returning({ id: calendarEvent.id });
    const insertedIds = new Set(inserted.map((row) => row.id));
    const links = COMPETITION_CALENDAR_SEED.filter((event) =>
      insertedIds.has(event.id),
    ).flatMap((event) =>
      event.categoryIds.map((categoryId) => ({
        eventId: event.id,
        categoryId,
      })),
    );
    if (links.length > 0)
      await tx
        .insert(calendarEventCategory)
        .values(links)
        .onConflictDoNothing();
  });
  console.log(`Seeded ${COMPETITION_CALENDAR_SEED.length} competition events`);
}

if (import.meta.main) {
  if (
    !seedCompetitionCalendarAllowed(
      env.NODE_ENV,
      process.env.SEED_ALLOWED_IN_PROD,
    )
  ) {
    console.error(
      "Refusing to seed the competition calendar in production/staging unless SEED_ALLOWED_IN_PROD=true",
    );
    process.exit(1);
  }
  await seedCompetitionCalendar();
  process.exit(0);
}
