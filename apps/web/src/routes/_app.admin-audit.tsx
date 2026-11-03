import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminAuditPage } from "@/components/admin/admin-audit-page";

export const Route = createFileRoute("/_app/admin-audit")({
  head: () => ({
    meta: [
      {
        title: "Audit Log · Cogito Academy",
      },
    ],
  }),
  component: AdminAuditPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
