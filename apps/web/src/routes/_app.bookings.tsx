import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BookingsPage } from "@/components/dashboard/pages/bookings-page";

export const Route = createFileRoute("/_app/bookings")({
  validateSearch: z.object({
    tab: z
      .enum(["upcoming", "pending", "recurring", "past", "cancelled", "all"])
      .optional()
      .catch("upcoming"),
  }),
  component: BookingsPage,
});
