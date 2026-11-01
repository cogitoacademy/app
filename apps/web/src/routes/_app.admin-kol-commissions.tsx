import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

export const Route = createFileRoute("/_app/admin-kol-commissions")({
  head: () => ({
    meta: [{ title: "KOL commissions · Cogito Academy" }],
  }),
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({
      to: "/admin-referrals",
      search: { view: "commissions" },
      replace: true,
    });
  },
});
