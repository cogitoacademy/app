import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import { orpc } from "@/utils/orpc";
import { OnboardingForm } from "@/components/tutor/onboarding-form";
import Loader from "@/components/loader";

export const Route = createFileRoute("/_app/onboarding")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    if (user?.role !== "tutor") {
      throw redirect({ to: "/dashboard" });
    }
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const user = session.data?.user as CogitoUser;
  const {
    data: profile,
    isLoading,
    error,
  } = useQuery(orpc.tutor.getMyProfile.queryOptions());

  if (isLoading) return <Loader />;
  if (error || !profile) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted">
          No tutor profile found. You may need to claim a tutor invitation
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-xl font-semibold">My Tutor Profile</h1>
      <OnboardingForm
        accountUser={{
          name: user.name,
          email: user.email,
          image: user.image,
        }}
        profile={{
          ...profile,
          expertise: profile.expertise ?? [],
          proofUrls: profile.proofUrls ?? [],
        }}
      />
    </div>
  );
}
