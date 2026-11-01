import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { ClassesPage } from "@/components/content/classes-page";

export const Route = createFileRoute("/_app/classes")({
  head: () => ({ meta: [{ title: "Classes · Cogito Academy" }] }),
  component: ClassesPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
