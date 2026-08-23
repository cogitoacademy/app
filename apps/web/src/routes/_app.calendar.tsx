import { createFileRoute } from "@tanstack/react-router";

import { CompetitionCalendarPage } from "@/components/content/competition-calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  component: CompetitionCalendarPage,
});
