import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CogitoUser } from "@cogito-app/auth";

export const Route = createFileRoute("/_app/onboarding")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    const user = context.session?.data?.user as CogitoUser | undefined;
    throw redirect({
      to: user?.role === "tutor" ? "/profile" : "/dashboard",
    });
  },
});

function RouteComponent() {
  return null;
}
