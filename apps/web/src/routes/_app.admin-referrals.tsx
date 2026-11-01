import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { AdminReferralsPage } from "@/components/admin/admin-referrals-page";

export const Route = createFileRoute("/_app/admin-referrals")({
  component: AdminReferralsPage,
  head: () => ({ meta: [{ title: "Referral usage · Cogito Academy" }] }),
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
