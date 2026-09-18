import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { KnowledgeBankAccessPage } from "@/components/admin/knowledge-bank-access-page";

export const Route = createFileRoute("/_app/admin-knowledge-bank")({
  head: () => ({
    meta: [{ title: "Knowledge Bank access · Cogito Academy" }],
  }),
  component: KnowledgeBankAccessPage,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});
