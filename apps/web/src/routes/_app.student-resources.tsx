import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";

import { StudentResourcesPage } from "@/components/content/student-resources-page";

export const Route = createFileRoute("/_app/student-resources")({
  component: StudentResourcesPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
