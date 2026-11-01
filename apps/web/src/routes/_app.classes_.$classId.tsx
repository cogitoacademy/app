import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { ClassDetailPage } from "@/components/content/class-detail-page";

export const Route = createFileRoute("/_app/classes_/$classId")({
  head: () => ({ meta: [{ title: "Class details · Cogito Academy" }] }),
  component: ClassDetailPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
