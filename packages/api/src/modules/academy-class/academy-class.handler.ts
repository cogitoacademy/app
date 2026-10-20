import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAcademyClassError } from "./academy-class.errors";
import type { AcademyClassService } from "./academy-class.service";
import {
  getAcademyClassInput,
  listAcademyClassesInput,
  saveAcademyClassDraftInput,
} from "./academy-class.types";
import type { z } from "zod";

export function createAcademyClassHandler(service: AcademyClassService) {
  return {
    listAcademyClasses: async ({
      input,
    }: {
      input: z.infer<typeof listAcademyClassesInput>;
    }) => withDomainMap(() => service.list(input), mapAcademyClassError),
    getAcademyClass: async ({
      input,
    }: {
      input: z.infer<typeof getAcademyClassInput>;
    }) => withDomainMap(() => service.get(input.id), mapAcademyClassError),
    saveAcademyClassDraft: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof saveAcademyClassDraftInput>;
    }) =>
      withDomainMap(
        () => service.saveDraft(context.session!.user.id, input),
        mapAcademyClassError,
      ),
  };
}

export type AcademyClassHandler = ReturnType<typeof createAcademyClassHandler>;
