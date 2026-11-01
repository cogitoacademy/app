import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { AdminClassDetailPage } from "@/components/admin/admin-class-detail-page";
import { ClassDetailPage } from "@/components/content/class-detail-page";

export const Route = createFileRoute("/_app/classes_/$classId")({
  head: () => ({ meta: [{ title: "Class details · Cogito Academy" }] }),
  component: ClassDetailRoute,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student" && user?.role !== "admin")
      throw redirect({ to: "/dashboard" });
  },
});

function ClassDetailRoute() {
  const { classId } = Route.useParams();
  const { session } = Route.useRouteContext();
  const viewer = session.data?.user as CogitoUser | undefined;
  return viewer?.role === "admin" ? (
    <AdminClassDetailPage classId={classId} />
  ) : (
    <ClassDetailPage classId={classId} />
  );
}
