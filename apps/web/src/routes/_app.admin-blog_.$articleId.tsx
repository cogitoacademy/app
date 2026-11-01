import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { BlogEditorPage } from "@/components/admin/blog/blog-editor-page";

export const Route = createFileRoute("/_app/admin-blog_/$articleId")({
  head: () => ({
    meta: [{ title: "Edit blog article · Cogito Academy" }],
  }),
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});

function RouteComponent() {
  const { articleId } = Route.useParams();
  return <BlogEditorPage articleId={articleId} />;
}
