import { createFileRoute } from "@tanstack/react-router";

import { BalancePage } from "@/components/dashboard/pages/balance-page";

export const Route = createFileRoute("/_app/balance")({
  component: BalancePage,
});
