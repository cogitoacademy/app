import type { Context } from "../../context";
import type { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapContentAdminError } from "./content-admin.errors";
import type { ContentAdminService } from "./content-admin.service";
import {
  createContentInput,
  updateContentInput,
  deleteContentInput,
  uploadPdfInput,
  kindInput,
} from "./content-admin.types";
export function createContentAdminHandler(service: ContentAdminService) {
  return {
    list: ({ input }: { input: z.infer<typeof kindInput> }) =>
      withDomainMap(() => service.list(input.kind), mapContentAdminError),
    categories: () =>
      withDomainMap(() => service.categories(), mapContentAdminError),
    create: ({
      input,
      context,
    }: {
      input: z.infer<typeof createContentInput>;
      context: Context;
    }) =>
      withDomainMap(
        () => service.create(input, context.session!.user.id),
        mapContentAdminError,
      ),
    update: ({
      input,
      context,
    }: {
      input: z.infer<typeof updateContentInput>;
      context: Context;
    }) =>
      withDomainMap(
        () => service.update(input, context.session!.user.id),
        mapContentAdminError,
      ),
    remove: ({
      input,
      context,
    }: {
      input: z.infer<typeof deleteContentInput>;
      context: Context;
    }) =>
      withDomainMap(
        () => service.remove(input, context.session!.user.id),
        mapContentAdminError,
      ),
    uploadPdf: ({ input }: { input: z.infer<typeof uploadPdfInput> }) =>
      withDomainMap(() => service.uploadPdf(input), mapContentAdminError),
  };
}
export type ContentAdminHandler = ReturnType<typeof createContentAdminHandler>;
