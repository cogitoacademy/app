import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { TutorClassDetailPage } from "@/components/tutor/tutor-class-detail-page";

export const Route = createFileRoute("/_app/my-classes_/$classId")({
  head: () => ({ meta: [{ title: "Class details · Cogito Academy" }] }),
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "tutor") throw redirect({ to: "/dashboard" });
  },
});

function RouteComponent() {
  const { classId } = Route.useParams();
  return <TutorClassDetailPage classId={classId} />;
}
