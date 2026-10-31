import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";

import { ContentPage } from "@/components/admin/content-page";
import { KnowledgeBankPage } from "@/components/content/knowledge-bank-page";

export const Route = createFileRoute("/_app/knowledge-bank")({
  head: () => ({
    meta: [
      {
        title: "Knowledge Bank · Cogito Academy",
      },
    ],
  }),
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (
      user?.role !== "student" &&
      user?.role !== "tutor" &&
      user?.role !== "admin"
    ) {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser | undefined;
  return user?.role === "admin" ? (
    <ContentPage
      kind="resource"
      preview={(onManage) => <KnowledgeBankPage onManage={onManage} />}
    />
  ) : (
    <KnowledgeBankPage />
  );
}
