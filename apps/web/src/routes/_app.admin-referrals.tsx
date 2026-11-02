import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { AdminReferralsPage } from "@/components/admin/admin-referrals-page";

export const Route = createFileRoute("/_app/admin-referrals")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    view: "activity" | "campaigns" | "commissions";
  } => ({
    view:
      search.view === "campaigns" || search.view === "commissions"
        ? search.view
        : "activity",
  }),
  component: AdminReferralsPage,
  head: () => ({ meta: [{ title: "Referrals · Cogito Academy" }] }),
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
