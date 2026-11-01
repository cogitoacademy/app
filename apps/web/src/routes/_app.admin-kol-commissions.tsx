import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminKolCommissionsPage } from "@/components/admin/admin-kol-commissions-page";

export const Route = createFileRoute("/_app/admin-kol-commissions")({
  head: () => ({
    meta: [{ title: "KOL commissions · Cogito Academy" }],
  }),
  component: AdminKolCommissionsPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
  },
});
