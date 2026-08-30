import { createFileRoute, redirect } from "@tanstack/react-router";

import type { CogitoUser } from "@cogito-app/auth";

import { KnowledgeBankPage } from "@/components/content/knowledge-bank-page";

export const Route = createFileRoute("/_app/knowledge-bank")({
  component: KnowledgeBankPage,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "student") throw redirect({ to: "/dashboard" });
  },
});
