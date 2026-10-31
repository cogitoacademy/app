import { expect, mock, test } from "bun:test";
import type { Context } from "../../context";
import { createBookingHandler } from "../../modules/booking/booking.handler";
import { createAdminHandler } from "../../modules/admin/admin.handler";
import { createClassEnrollmentHandler } from "../../modules/class-enrollment/class-enrollment.handler";
import { createContentAdminHandler } from "../../modules/content-admin/content-admin.handler";

test("private report listing passes authenticated identity and role with an empty-role fallback", async () => {
  const listReportSessions = mock(async () => [{ id: "report1" }]);
  const handler = createBookingHandler({
    listReportSessions,
  } as unknown as Parameters<typeof createBookingHandler>[0]);
  for (const role of ["admin", "tutor", undefined]) {
    const context = { session: { user: { id: "actor1", role } } } as Context;
    expect(await handler.listReportSessions({ context })).toEqual([
      { id: "report1" },
    ]);
    expect(listReportSessions).toHaveBeenLastCalledWith("actor1", role ?? "");
  }
});

test("economy activation passes administrator identity and version expectations", async () => {
  const activateV3EconomySettings = mock(async () => ({ version: 3 }));
  const handler = createAdminHandler({
    activateV3EconomySettings,
  } as unknown as Parameters<typeof createAdminHandler>[0]);
  const input = {
    version: 3,
    expectedActiveRevision: 2,
    reason: "Approved",
  } as Parameters<typeof handler.activateV3EconomySettings>[0]["input"];
  expect(
    await handler.activateV3EconomySettings({
      context: { session: { user: { id: "admin1" } } } as Context,
      input,
    }),
  ).toEqual({ version: 3 });
  expect(activateV3EconomySettings).toHaveBeenCalledWith("admin1", input);
});

test("schedule-change cancellation handlers pass the student identity and immutable quote identity", async () => {
  const quoteChangedSessionCancellation = mock(async () => ({
    refundableMarks: 25,
  }));
  const confirmChangedSessionCancellation = mock(async () => ({
    refundableMarks: 25,
  }));
  const handler = createClassEnrollmentHandler({
    quoteChangedSessionCancellation,
    confirmChangedSessionCancellation,
  } as unknown as Parameters<typeof createClassEnrollmentHandler>[0]);
  const context = { session: { user: { id: "student1" } } } as Context;
  const input = {
    enrollmentId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    scheduleChangeVersion: 2,
  };
  expect(
    await handler.quoteChangedSessionCancellation({ context, input }),
  ).toEqual({ refundableMarks: 25 });
  expect(quoteChangedSessionCancellation).toHaveBeenCalledWith(
    "student1",
    input,
  );
  const confirmation = {
    ...input,
    requestKey: crypto.randomUUID(),
    quoteVersion: "f".repeat(64),
  };
  expect(
    await handler.confirmChangedSessionCancellation({
      context,
      input: confirmation,
    }),
  ).toEqual({ refundableMarks: 25 });
  expect(confirmChangedSessionCancellation).toHaveBeenCalledWith(
    "student1",
    confirmation,
  );
});

test("private PDF preview forwards only the requested file identity", async () => {
  const previewPdf = mock(async () => ({
    fileName: "notes.pdf",
    base64: "cGRm",
  }));
  const handler = createContentAdminHandler({
    previewPdf,
  } as unknown as Parameters<typeof createContentAdminHandler>[0]);
  expect(await handler.previewPdf({ input: { fileId: "file1" } })).toEqual({
    fileName: "notes.pdf",
    base64: "cGRm",
  });
  expect(previewPdf).toHaveBeenCalledWith("file1");
});
