import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

import { ProfilePage } from "@/components/dashboard/pages/profile-page";
import { useRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_app/profile")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role === "tutor") throw redirect({ to: "/onboarding" });
    if (user?.role === "admin") throw redirect({ to: "/dashboard" });
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const { profile, user, isLoading } = useRole();
  const sessionUser = session.data?.user as CogitoUser | undefined;
  const profileUser = user
    ? {
        name: user.name || sessionUser?.name || "",
        email: user.email || sessionUser?.email || "",
        image: user.image ?? sessionUser?.image ?? null,
      }
    : sessionUser;
  const profileRecord: Record<string, string | null | undefined> | undefined =
    profile
      ? Object.fromEntries(
          Object.entries(profile).map(([k, v]) => [
            k,
            typeof v === "string" || v === null ? v : undefined,
          ]),
        )
      : undefined;

  return (
    <ProfilePage
      profile={profileRecord}
      user={profileUser}
      isLoading={isLoading}
    />
  );
}
