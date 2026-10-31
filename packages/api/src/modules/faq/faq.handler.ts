import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapFaqError } from "./faq.errors";
import type { FaqService } from "./faq.service";
import {
  reorderFaqInput,
  createFaqInput,
  listAdminFaqInput,
  listPublicFaqInput,
  updateFaqInput,
} from "./faq.types";
import type { z } from "zod";

export function createFaqHandler(service: FaqService) {
  return {
    reorder: ({ input }: { input: z.infer<typeof reorderFaqInput> }) =>
      withDomainMap(() => service.reorder(input), mapFaqError),
    listPublic: ({ input }: { input: z.infer<typeof listPublicFaqInput> }) =>
      service.listPublic(input),
    listAdmin: ({
      input: _input,
    }: {
      input: z.infer<typeof listAdminFaqInput>;
    }) => withDomainMap(() => service.listAdmin(), mapFaqError),
    create: ({
      context: _context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof createFaqInput>;
    }) => withDomainMap(() => service.create(input), mapFaqError),
    update: ({
      context: _context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof updateFaqInput>;
    }) => withDomainMap(() => service.update(input), mapFaqError),
  };
}

export type FaqHandler = ReturnType<typeof createFaqHandler>;
