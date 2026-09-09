import { createFileRoute } from "@tanstack/react-router";

import { AchievementsPage } from "@/components/dashboard/pages/achievements-page";

export const Route = createFileRoute("/_app/achievements")({
  component: AchievementsPage,
});
