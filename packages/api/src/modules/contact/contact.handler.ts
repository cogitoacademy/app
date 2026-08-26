import { z } from "zod";

import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapContactError } from "./contact.errors";
import type {
  listForBookingInput,
  requestContactInput,
  respondContactRequestInput,
} from "./contact.types";
import type { ContactService } from "./contact.service";

type ListForBookingInput = z.infer<typeof listForBookingInput>;
type RequestContactInput = z.infer<typeof requestContactInput>;
type RespondContactRequestInput = z.infer<typeof respondContactRequestInput>;

export type ContactHandler = ReturnType<typeof createContactHandler>;

export function createContactHandler(contact: ContactService) {
  return {
    listForBooking: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListForBookingInput;
    }) =>
      withDomainMap(
        () => contact.listForBooking(context.session!.user.id, input.bookingId),
        mapContactError,
      ),

    request: async ({
      context,
      input,
    }: {
      context: Context;
      input: RequestContactInput;
    }) =>
      withDomainMap(
        () => contact.requestContact(context.session!.user.id, input),
        mapContactError,
      ),

    respond: async ({
      context,
      input,
    }: {
      context: Context;
      input: RespondContactRequestInput;
    }) =>
      withDomainMap(
        () => contact.respondToRequest(context.session!.user.id, input),
        mapContactError,
      ),
  };
}
