import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { AcademyClassPage } from "@/components/admin/academy-class-page";

export const Route = createFileRoute("/_app/admin-classes")({
  head: () => ({
    meta: [{ title: "Class studio · Cogito Academy" }],
  }),
  component: AcademyClassPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
