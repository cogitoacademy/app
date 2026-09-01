export type BookingEventTitleTopic = {
  categorySlug: string;
  categoryName: string;
};

export type BookingEventTitleInput = {
  targetGroupSize: number;
  sessionTopic?: BookingEventTitleTopic | null;
  tutorName?: string | null;
  proposerName?: string | null;
};

const CALENDAR_COMPETITION_LABELS: Record<string, string> = {
  "competition-model-united-nations": "MUN",
  "model-united-nations": "MUN",
  "competition-world-scholars-cup": "WSC",
  "world-scholars-cup": "WSC",
};

export function formatCalendarCompetitionLabel(
  sessionTopic: BookingEventTitleTopic | null | undefined,
): string {
  if (!sessionTopic) return "Session";
  return (
    CALENDAR_COMPETITION_LABELS[sessionTopic.categorySlug] ??
    sessionTopic.categoryName
  );
}

/**
 * Keeps booking-facing titles in parity with the Google Calendar/Meet event
 * summary. Group titles intentionally use the proposer as the named student
 * and `& Friends` instead of enumerating a variable participant list.
 */
export function formatBookingEventTitle({
  targetGroupSize,
  sessionTopic,
  tutorName,
  proposerName,
}: BookingEventTitleInput): string {
  const competitionLabel = formatCalendarCompetitionLabel(sessionTopic);
  const resolvedTutorName = tutorName?.trim() || "Cogito tutor";
  const primaryStudentName = proposerName?.trim() || "Student";
  const studentLabel =
    targetGroupSize > 1
      ? `${primaryStudentName} & Friends`
      : primaryStudentName;

  return `Cogito - ${competitionLabel} | ${resolvedTutorName} x ${studentLabel}`;
}
