import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAdminMarkPackageError } from "./admin-mark-package.errors";
import type { AdminMarkPackageService } from "./admin-mark-package.service";
import {
  createMarkPackageInput,
  setMarkPackageActiveInput,
  updateMarkPackageInput,
} from "./admin-mark-package.types";

type CreateInput = z.infer<typeof createMarkPackageInput>;
type UpdateInput = z.infer<typeof updateMarkPackageInput>;
type SetActiveInput = z.infer<typeof setMarkPackageActiveInput>;

export type AdminMarkPackageHandler = ReturnType<
  typeof createAdminMarkPackageHandler
>;

export function createAdminMarkPackageHandler(
  service: AdminMarkPackageService,
) {
  return {
    list: async ({ context: _context }: { context: Context }) =>
      withDomainMap(() => service.list(), mapAdminMarkPackageError),

    create: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateInput;
    }) =>
      withDomainMap(
        () => service.create(context.session!.user.id, input),
        mapAdminMarkPackageError,
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
        mapAdminMarkPackageError,
      ),

    setActive: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetActiveInput;
    }) =>
      withDomainMap(
        () => service.setActive(context.session!.user.id, input),
        mapAdminMarkPackageError,
      ),
  };
}
