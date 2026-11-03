import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { isSuperAdminEmail } from "@cogito-app/env/admin";

import { AdminAdminsPage } from "@/components/admin/admin-admins-page";

export const Route = createFileRoute("/_app/admin-admins")({
  head: () => ({
    meta: [
      {
        title: "Manage admins · Cogito Academy",
      },
    ],
  }),
  component: AdminAdminsPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin" || !isSuperAdminEmail(user.email)) {
      throw redirect({ to: "/admin" });
    }
  },
});
