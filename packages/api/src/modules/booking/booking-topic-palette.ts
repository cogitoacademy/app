import type { BookingSessionTopic } from "@cogito-app/db/schema";
import type {
  CompetitionPalette,
  CompetitionPaletteReference,
} from "../competition-catalog/competition-catalog.types";

type TopicWithPalette = BookingSessionTopic & {
  parentColors?: CompetitionPalette;
};

type BookingWithTopic = {
  sessionTopic: BookingSessionTopic | null;
};

type ResolvePalettes = (
  references: readonly CompetitionPaletteReference[],
) => Promise<Array<CompetitionPalette | null>>;

export interface BookingCompetitionPalettePort {
  resolveCompetitionPalettes: ResolvePalettes;
}

/** Adds the current catalog palette to booking read projections in one lookup. */
export async function applyBookingTopicPalettes<T extends BookingWithTopic>(
  bookings: readonly T[],
  resolvePalettes?: ResolvePalettes,
): Promise<
  Array<Omit<T, "sessionTopic"> & { sessionTopic: TopicWithPalette | null }>
> {
  if (!resolvePalettes) {
    return bookings.map((booking) => ({
      ...booking,
      sessionTopic: booking.sessionTopic as TopicWithPalette | null,
    }));
  }

  const topics = bookings.flatMap((booking) =>
    booking.sessionTopic ? [booking.sessionTopic] : [],
  );
  if (topics.length === 0) {
    return bookings.map((booking) => ({ ...booking, sessionTopic: null }));
  }

  const palettes = await resolvePalettes(
    topics.map((topic) => ({ id: topic.categoryId, slug: topic.categorySlug })),
  );
  let paletteIndex = 0;

  return bookings.map((booking) => {
    const topic = booking.sessionTopic;
    if (!topic) return { ...booking, sessionTopic: null };

    const parentColors = palettes[paletteIndex++] ?? undefined;
    return {
      ...booking,
      sessionTopic: {
        ...topic,
        ...(parentColors ? { parentColors } : {}),
      },
    };
  });
}
