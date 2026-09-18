import { z } from "zod";

import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminKnowledgeBankError } from "./admin-knowledge-bank.errors";
import type { AdminKnowledgeBankService } from "./admin-knowledge-bank.service";
import {
  createKnowledgeBankAccessInput,
  listKnowledgeBankAccessInput,
  removeKnowledgeBankAccessInput,
  updateKnowledgeBankAccessInput,
} from "./admin-knowledge-bank.types";

type ListInput = z.infer<typeof listKnowledgeBankAccessInput>;
type CreateInput = z.infer<typeof createKnowledgeBankAccessInput>;
type UpdateInput = z.infer<typeof updateKnowledgeBankAccessInput>;
type RemoveInput = z.infer<typeof removeKnowledgeBankAccessInput>;

export type AdminKnowledgeBankHandler = ReturnType<
  typeof createAdminKnowledgeBankHandler
>;

export function createAdminKnowledgeBankHandler(
  service: AdminKnowledgeBankService,
) {
  return {
    list: async ({ input }: { context: Context; input: ListInput }) =>
      withDomainMap(() => service.list(input), mapAdminKnowledgeBankError),

    create: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateInput;
    }) =>
      withDomainMap(
        () => service.create(context.session!.user.id, input),
        mapAdminKnowledgeBankError,
      ),

    update: async ({
      context,
      input,
    }: {
      context: Context;
      input: UpdateInput;
    }) =>
      withDomainMap(
        () => service.update(context.session!.user.id, input),
        mapAdminKnowledgeBankError,
      ),

    remove: async ({
      context,
      input,
    }: {
      context: Context;
      input: RemoveInput;
    }) =>
      withDomainMap(
        () => service.remove(context.session!.user.id, input.id),
        mapAdminKnowledgeBankError,
      ),
  };
}
