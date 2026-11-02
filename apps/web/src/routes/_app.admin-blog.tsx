import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { BlogListPage } from "@/components/admin/blog/blog-list-page";

export const Route = createFileRoute("/_app/admin-blog")({
  head: () => ({
    meta: [{ title: "Blog · Cogito Academy" }],
  }),
  component: BlogListPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
