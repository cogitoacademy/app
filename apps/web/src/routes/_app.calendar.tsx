import { createFileRoute } from "@tanstack/react-router";

import { CompetitionCalendarPage } from "@/components/content/competition-calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      {
        title: "Competition calendar · Cogito Academy",
      },
    ],
  }),
  component: CompetitionCalendarPage,
});
