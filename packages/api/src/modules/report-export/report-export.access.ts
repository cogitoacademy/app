export type ReportExportActor = { id: string; role: string };

export type ReportExportAuthorization =
  | { ok: true; studentId: string }
  | { ok: false; status: 400 | 403 };

export function authorizeReportExport(
  actor: ReportExportActor,
  requestedStudentId?: string,
): ReportExportAuthorization {
  if (actor.role === "student") {
    return requestedStudentId && requestedStudentId !== actor.id
      ? { ok: false, status: 403 }
      : { ok: true, studentId: actor.id };
  }

  if (actor.role === "admin") {
    return requestedStudentId
      ? { ok: true, studentId: requestedStudentId }
      : { ok: false, status: 400 };
  }

  return { ok: false, status: 403 };
}
