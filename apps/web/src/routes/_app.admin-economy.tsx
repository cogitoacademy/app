import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { EconomySettingsPage } from "@/components/admin/economy-settings-page";

export const Route = createFileRoute("/_app/admin-economy")({
  component: EconomySettingsPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
