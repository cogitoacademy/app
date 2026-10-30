import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAcademyClassError } from "./academy-class.errors";
import type { AcademyClassService } from "./academy-class.service";
import {
  getAcademyClassInput,
  listAcademyClassesInput,
  publishAcademyClassInput,
  retryAcademyClassMeetingsInput,
  reportTutorAbsenceInput,
  replaceAbsentClassTutorInput,
  rescheduleAcademyClassSessionInput,
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
    listPublishedAcademyClasses: async () =>
      withDomainMap(() => service.listPublished(), mapAcademyClassError),
    getPublishedAcademyClass: async ({
      input,
    }: {
      input: z.infer<typeof getAcademyClassInput>;
    }) =>
      withDomainMap(() => service.getPublished(input.id), mapAcademyClassError),
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
    publishAcademyClass: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof publishAcademyClassInput>;
    }) =>
      withDomainMap(
        () => service.publish(context.session!.user.id, input),
        mapAcademyClassError,
      ),
    retryAcademyClassMeetings: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof retryAcademyClassMeetingsInput>;
    }) =>
      withDomainMap(
        () => service.retryMeetings(context.session!.user.id, input),
        mapAcademyClassError,
      ),
    reportTutorAbsence: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof reportTutorAbsenceInput>;
    }) =>
      withDomainMap(
        () => service.reportTutorAbsence(context.session!.user.id, input),
        mapAcademyClassError,
      ),
    replaceAbsentClassTutor: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof replaceAbsentClassTutorInput>;
    }) =>
      withDomainMap(
        () => service.replaceAbsentTutor(context.session!.user.id, input),
        mapAcademyClassError,
      ),
    rescheduleClassSession: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof rescheduleAcademyClassSessionInput>;
    }) =>
      withDomainMap(
        () => service.rescheduleSession(context.session!.user.id, input),
        mapAcademyClassError,
      ),
  };
}

export type AcademyClassHandler = ReturnType<typeof createAcademyClassHandler>;
