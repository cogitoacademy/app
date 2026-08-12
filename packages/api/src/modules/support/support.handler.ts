import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapSupportError } from "./support.errors";
import type {
  createTicketInput,
  listTicketsInput,
  adminListTicketsInput,
  adminResolveTicketInput,
} from "./support.types";
import type { SupportService } from "./support.service";

type CreateTicketInput = z.infer<typeof createTicketInput>;
type ListTicketsInput = z.infer<typeof listTicketsInput>;
type AdminListTicketsInput = z.infer<typeof adminListTicketsInput>;
type AdminResolveTicketInput = z.infer<typeof adminResolveTicketInput>;

export function createSupportHandler(deps: { supportService: SupportService }) {
  const { supportService } = deps;

  async function createTicket({
    context,
    input,
  }: {
    context: Context;
    input: CreateTicketInput;
  }) {
    return withDomainMap(
      () => supportService.createTicket(context.session!.user.id, input),
      mapSupportError,
    );
  }

  async function listTickets({
    context,
    input,
  }: {
    context: Context;
    input: ListTicketsInput;
  }) {
    return withDomainMap(
      () => supportService.listTickets(context.session!.user.id, input),
      mapSupportError,
    );
  }

  async function adminListTickets({
    input,
  }: {
    context: Context;
    input: AdminListTicketsInput;
  }) {
    return withDomainMap(
      () => supportService.adminList(input),
      mapSupportError,
    );
  }

  async function adminResolveTicket({
    context,
    input,
  }: {
    context: Context;
    input: AdminResolveTicketInput;
  }) {
    return withDomainMap(
      () => supportService.adminResolveTicket(context.session!.user.id, input),
      mapSupportError,
    );
  }

  return { createTicket, listTickets, adminListTickets, adminResolveTicket };
}

export type SupportHandler = ReturnType<typeof createSupportHandler>;
