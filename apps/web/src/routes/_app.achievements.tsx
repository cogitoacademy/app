import { createFileRoute } from "@tanstack/react-router";

import { AchivementsPage } from "@/components/dashboard/pages/achivements-page";

export const Route = createFileRoute("/_app/achievements")({
  component: AchivementsPage,
});
