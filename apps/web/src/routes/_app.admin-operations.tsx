"use client";

import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { AdminOperationsPage } from "@/components/admin/admin-operations-page";

export const Route = createFileRoute("/_app/admin-operations")({
  head: () => ({
    meta: [
      {
        title: "Operations · Cogito Academy",
      },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { operationsTab?: "support" } => ({
    operationsTab: search.operationsTab === "support" ? "support" : undefined,
  }),
  component: OperationsRoute,
  beforeLoad: ({ context }) => {
    const user = context.session.data?.user as CogitoUser | undefined;
    if (user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
});

function OperationsRoute() {
  const { operationsTab } = Route.useSearch();
  return (
    <AdminOperationsPage
      key={operationsTab ?? "queue"}
      initialTab={operationsTab}
    />
  );
}
