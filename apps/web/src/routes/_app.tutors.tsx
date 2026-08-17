import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { TutorsPage } from "@/components/dashboard/pages/tutors-page";

export const Route = createFileRoute("/_app/tutors")({
  component: TutorsPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
