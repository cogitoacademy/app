import { studentProcedure } from "../../procedures";
import type { ContactHandler } from "./contact.handler";
import {
  listForBookingInput,
  requestContactInput,
  respondContactRequestInput,
} from "./contact.types";

export function createContactRouter(handler: ContactHandler) {
  return {
    listForBooking: studentProcedure
      .route({
        method: "POST",
        path: "/contact/booking/list",
        tags: ["Contact"],
        summary: "List contact options for a completed booking",
        description:
          "Returns shared-session peers and consent state without exposing email before it is explicitly shared",
      })
      .input(listForBookingInput)
      .handler(handler.listForBooking),

    request: studentProcedure
      .route({
        method: "POST",
        path: "/contact/request",
        tags: ["Contact"],
        summary: "Request contact exchange",
        description:
          "Sends an in-app contact request to a student from a completed shared booking",
      })
      .input(requestContactInput)
      .handler(handler.request),

    respond: studentProcedure
      .route({
        method: "POST",
        path: "/contact/respond",
        tags: ["Contact"],
        summary: "Respond to a contact request",
        description:
          "Accepts with email, accepts without email, or declines a contact request",
      })
      .input(respondContactRequestInput)
      .handler(handler.respond),
  };
}
