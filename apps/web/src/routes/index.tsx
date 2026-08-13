import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/marketing/landing-page";

export const Route = createFileRoute("/")({
  component: LandingPage,
});
