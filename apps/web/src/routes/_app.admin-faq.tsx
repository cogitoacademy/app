import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { FaqPage } from "@/components/admin/faq-page";

export const Route = createFileRoute("/_app/admin-faq")({
  head: () => ({
    meta: [{ title: "FAQ · Cogito Academy" }],
  }),
  component: FaqPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
