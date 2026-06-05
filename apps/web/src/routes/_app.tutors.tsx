import { createFileRoute } from "@tanstack/react-router";

import { TutorsPage } from "@/components/dashboard/pages/tutors-page";

export const Route = createFileRoute("/_app/tutors")({
  component: TutorsPage,
});
