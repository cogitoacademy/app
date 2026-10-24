import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";
import { ContentPage } from "@/components/admin/content-page";
export const Route = createFileRoute("/_app/admin-content")({
  head: () => ({ meta: [{ title: "KB & calendar · Cogito Academy" }] }),
  component: ContentPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
