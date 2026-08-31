import { createFileRoute, redirect } from "@tanstack/react-router";
import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";

import { ProfilePage } from "@/components/dashboard/pages/profile-page";
import { TutorProfilePage } from "@/components/tutor/tutor-profile-page";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_app/profile")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role === "admin") throw redirect({ to: "/dashboard" });
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const sessionUser = session.data?.user as CogitoUser | undefined;

  if (sessionUser?.role === "tutor") {
    return (
      <TutorProfilePage
        accountUser={{
          name: sessionUser.name,
          email: sessionUser.email,
          image: sessionUser.image,
        }}
      />
    );
  }

  return <StudentProfileRoute sessionUser={sessionUser} />;
}

function StudentProfileRoute({
  sessionUser,
}: {
  sessionUser: CogitoUser | undefined;
}) {
  const { data: profile, isLoading } = useQuery({
    queryKey: orpc.auth.getProfile.key(),
    queryFn: async () => {
      try {
        return await client.auth.getProfile();
      } catch (error) {
        // A new student has no row yet; that is a valid empty profile state.
        if (error instanceof ORPCError && error.code === "NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },
  });
  const profileRecord:
    | Record<string, string | boolean | null | undefined>
    | undefined = profile
    ? Object.fromEntries(
        Object.entries(profile).map(([k, v]) => [
          k,
          typeof v === "string" || typeof v === "boolean" || v === null
            ? v
            : undefined,
        ]),
      )
    : undefined;

  return (
    <ProfilePage
      profile={profileRecord}
      user={sessionUser}
      isLoading={isLoading}
    />
  );
}
