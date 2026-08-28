import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BookingsPage } from "@/components/dashboard/pages/bookings-page";

export const Route = createFileRoute("/_app/bookings")({
  validateSearch: z.object({
    tab: z
      .enum(["action", "upcoming", "recurring", "history", "all"])
      .optional()
      .catch("upcoming"),
    sort: z
      .enum(["recommended", "soonest", "latest"])
      .optional()
      .catch("recommended"),
  }),
  component: BookingsPage,
});
