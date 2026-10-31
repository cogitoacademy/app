import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { ClassSessionReportsPage } from "@/components/booking/class-session-reports-page";

export const Route = createFileRoute("/_app/class-reports")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { workspace?: "reports" | "sessions"; report?: string } => ({
    workspace:
      search.workspace === "sessions" || search.workspace === "reports"
        ? search.workspace
        : undefined,
    report:
      typeof search.report === "string" && search.report.length <= 200
        ? search.report
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Session reports · Cogito Academy" }] }),
  component: ClassSessionReportsPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (!user || !["student", "tutor", "admin"].includes(user.role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
});
