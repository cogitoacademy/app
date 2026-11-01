import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { MyClassesPage } from "@/components/tutor/my-classes-page";

export const Route = createFileRoute("/_app/my-classes")({
  head: () => ({ meta: [{ title: "My classes · Cogito Academy" }] }),
  component: MyClassesPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "tutor") throw redirect({ to: "/dashboard" });
  },
});
