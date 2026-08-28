import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import {
  Card,
  CardBody,
  CardDescription,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
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
      <Card className="mx-auto w-full max-w-2xl">
        <CardBody className="flex flex-col items-center gap-2 text-center">
          <CardTitle>Tutor profile unavailable</CardTitle>
          <CardDescription>
            No tutor profile found. You may need to claim a tutor invitation
            first.
          </CardDescription>
        </CardBody>
      </Card>
    );
  }

  return (
    <OnboardingForm
      accountUser={{
        name: user.name,
        email: user.email,
        image: user.image,
      }}
      profile={{
        ...profile,
        expertise: profile.expertise ?? [],
      }}
    />
  );
}
