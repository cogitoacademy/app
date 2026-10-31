import { expect, mock, test } from "bun:test";
import type { Context } from "../../context";
import { createAcademyClassHandler } from "../../modules/academy-class/academy-class.handler";
import type { AcademyClassService } from "../../modules/academy-class/academy-class.service";

test("academy handlers return service results and attribute mutations to the session actor", async () => {
  const result = { id: "class-1" };
  const methods = {
    list: mock(async () => result),
    get: mock(async () => result),
    listPublished: mock(async () => result),
    getPublished: mock(async () => result),
    saveDraft: mock(async () => result),
    publish: mock(async () => result),
    retryMeetings: mock(async () => result),
    reportTutorAbsence: mock(async () => result),
    replaceAbsentTutor: mock(async () => result),
    rescheduleSession: mock(async () => result),
  };
  const handler = createAcademyClassHandler(
    methods as unknown as AcademyClassService,
  );
  const context = { session: { user: { id: "actor-1" } } } as Context;
  expect(
    await handler.listAcademyClasses({ input: { state: "published" } }),
  ).toEqual(result);
  expect(methods.list).toHaveBeenCalledWith({ state: "published" });
  expect(await handler.getAcademyClass({ input: { id: "class-1" } })).toEqual(
    result,
  );
  expect(methods.get).toHaveBeenCalledWith("class-1");
  expect(await handler.listPublishedAcademyClasses()).toEqual(result);
  expect(methods.listPublished).toHaveBeenCalledWith();
  expect(
    await handler.getPublishedAcademyClass({ input: { id: "class-1" } }),
  ).toEqual(result);
  expect(methods.getPublished).toHaveBeenCalledWith("class-1");
  const draft = { titleEn: "Edited class" } as Parameters<
    typeof handler.saveAcademyClassDraft
  >[0]["input"];
  expect(
    await handler.saveAcademyClassDraft({ context, input: draft }),
  ).toEqual(result);
  expect(methods.saveDraft).toHaveBeenCalledWith("actor-1", draft);
  const publish = { id: "class-1", expectedVersion: 1 } as Parameters<
    typeof handler.publishAcademyClass
  >[0]["input"];
  expect(
    await handler.publishAcademyClass({ context, input: publish }),
  ).toEqual(result);
  expect(methods.publish).toHaveBeenCalledWith("actor-1", publish);
  const retry = { id: "class-1" } as Parameters<
    typeof handler.retryAcademyClassMeetings
  >[0]["input"];
  expect(
    await handler.retryAcademyClassMeetings({ context, input: retry }),
  ).toEqual(result);
  expect(methods.retryMeetings).toHaveBeenCalledWith("actor-1", retry);
  const absence = {
    sessionId: "session-1",
    requestKey: "request-1",
    reason: "Illness",
  };
  expect(await handler.reportTutorAbsence({ context, input: absence })).toEqual(
    result,
  );
  expect(methods.reportTutorAbsence).toHaveBeenCalledWith("actor-1", absence);
  const replacement = {
    sessionId: "session-1",
    expectedVersion: 1,
    replacementTutorId: "tutor-2",
    reason: "Replacement",
  };
  expect(
    await handler.replaceAbsentClassTutor({ context, input: replacement }),
  ).toEqual(result);
  expect(methods.replaceAbsentTutor).toHaveBeenCalledWith(
    "actor-1",
    replacement,
  );
  const reschedule = { sessionId: "session-1" } as Parameters<
    typeof handler.rescheduleClassSession
  >[0]["input"];
  expect(
    await handler.rescheduleClassSession({ context, input: reschedule }),
  ).toEqual(result);
  expect(methods.rescheduleSession).toHaveBeenCalledWith("actor-1", reschedule);
});
