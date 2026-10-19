import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { CompetitionCatalogPage } from "@/components/admin/competition-catalog-page";

export const Route = createFileRoute("/_app/admin-competitions")({
  head: () => ({
    meta: [{ title: "Competition catalog · Cogito Academy" }],
  }),
  component: CompetitionCatalogPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
