import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { ClassSessionReportsPage } from "@/components/booking/class-session-reports-page";

export const Route = createFileRoute("/_app/class-reports")({
  head: () => ({ meta: [{ title: "Session reports · Cogito Academy" }] }),
  component: ClassSessionReportsPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (!user || !["student", "tutor", "admin"].includes(user.role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
});
