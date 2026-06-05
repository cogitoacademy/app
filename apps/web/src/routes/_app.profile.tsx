import { createFileRoute } from "@tanstack/react-router";

import { ProfilePage } from "@/components/dashboard/pages/profile-page";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_app/profile")({
  component: RouteComponent,
});

function RouteComponent() {
  const { profile } = useRole();
  const profileRecord: Record<string, string | null | undefined> | undefined =
    profile
      ? Object.fromEntries(
          Object.entries(profile).map(([k, v]) => [
            k,
            typeof v === "string" || v === null ? v : undefined,
          ]),
        )
      : undefined;

  return <ProfilePage profile={profileRecord} />;
}
