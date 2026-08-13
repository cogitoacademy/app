import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AchievementModerationPage } from "@/components/admin/achievement-moderation-page";

export const Route = createFileRoute("/_app/admin-achievements")({
  component: AchievementModerationPage,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});
