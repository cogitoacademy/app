import { createFileRoute } from "@tanstack/react-router";
import { InviteClaimPage } from "@/components/tutor/invite-claim-page";

export const Route = createFileRoute("/invite")({
  component: RouteComponent,
  validateSearch: (search: Record<string, string>) => ({
    token: search.token ?? "",
  }),
});

function RouteComponent() {
  const { token } = Route.useSearch();
  return <InviteClaimPage token={token} />;
}