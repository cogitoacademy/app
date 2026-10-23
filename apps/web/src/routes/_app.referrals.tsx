import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { ReferralsPage } from "@/components/referrals-page";

export const Route = createFileRoute("/_app/referrals")({
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
  component: ReferralsPage,
  head: () => ({
    meta: [{ title: "My referrals · Cogito Academy" }],
  }),
});
