import { protectedProcedure, adminProcedure } from "../../procedures";
import {
  createTicketInput,
  listTicketsInput,
  adminListTicketsInput,
  adminResolveTicketInput,
} from "./support.types";
import type { SupportHandler } from "./support.handler";

export function createSupportRouter(handler: SupportHandler) {
  return {
    createTicket: protectedProcedure
      .route({
        method: "POST",
        path: "/support/tickets/create",
        tags: ["Support"],
        summary: "Create support ticket",
        description:
          "Reports a tutoring lateness/no-show or another issue. Lateness/no-show categories require the booking to have started more than 15 minutes ago.",
      })
      .input(createTicketInput)
      .handler(handler.createTicket),

    listTickets: protectedProcedure
      .route({
        method: "POST",
        path: "/support/tickets/list",
        tags: ["Support"],
        summary: "List own support tickets",
        description: "Returns the authenticated user's support tickets",
      })
      .input(listTicketsInput)
      .handler(handler.listTickets),

    adminListTickets: adminProcedure
      .route({
        method: "POST",
        path: "/admin/support/tickets/list",
        tags: ["Admin", "Support"],
        summary: "List all support tickets",
        description:
          "Returns all support tickets sorted by SLA urgency (earliest deadline first)",
      })
      .input(adminListTicketsInput)
      .handler(handler.adminListTickets),

    adminResolveTicket: adminProcedure
      .route({
        method: "POST",
        path: "/admin/support/tickets/resolve",
        tags: ["Admin", "Support"],
        summary: "Resolve support ticket",
        description:
          "Resolves a support ticket, assigns the admin, and notifies the reporter",
      })
      .input(adminResolveTicketInput)
      .handler(handler.adminResolveTicket),
  };
}
