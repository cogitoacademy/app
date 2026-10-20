import { academyClassSession } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AuditPort } from "../audit/audit.service";
import {
  AcademyClassInvalidOperationError,
  AcademyClassNotFoundError,
  AcademyClassStateConflictError,
  AcademyClassVersionConflictError,
} from "./academy-class.errors";
import { createAcademyClassRepo } from "./academy-class.repo";
import {
  listAcademyClassesInput,
  saveAcademyClassDraftInput,
} from "./academy-class.types";
import type { z } from "zod";

export type AcademyClassService = ReturnType<typeof createAcademyClassService>;
type SaveDraftInput = z.infer<typeof saveAcademyClassDraftInput>;
type SessionDraftInput = SaveDraftInput["sessions"][number];

export function createAcademyClassService(deps: {
  db: DbType;
  audit: AuditPort;
}) {
  const repo = createAcademyClassRepo(deps.db);

  async function list(input: z.infer<typeof listAcademyClassesInput>) {
    return repo.list(deps.db, input);
  }

  async function get(id: string) {
    const record = await repo.get(deps.db, id);
    if (!record) throw new AcademyClassNotFoundError(id);
    return record;
  }

  function classValues(input: SaveDraftInput, actorId: string) {
    return {
      kind: input.kind,
      competitionId: input.competitionId,
      titleEn: input.titleEn,
      titleId: input.titleId ?? null,
      descriptionEn: input.descriptionEn,
      descriptionId: input.descriptionId ?? null,
      coverKey: input.coverKey ?? null,
      minimumEnrollment:
        input.kind === "cohort" ? input.minimumEnrollment : null,
      minimumCheckAt: input.kind === "cohort" ? input.minimumCheckAt : null,
      cohortFullRateMarks: input.kind === "cohort" ? input.fullRateMarks : null,
      cohortHalfRateMarks: input.kind === "cohort" ? input.halfRateMarks : null,
      cohortSingleRateMarks:
        input.kind === "cohort" ? input.singleRateMarks : null,
      masterclassRateMarks:
        input.kind === "masterclass" ? input.masterclassRateMarks : null,
      tutorFeeIdr: input.tutorFeeIdr,
      updatedBy: actorId,
    };
  }

  function sessionValues(
    input: SaveDraftInput,
    session: SessionDraftInput,
    classId: string,
    index: number,
  ): typeof academyClassSession.$inferInsert {
    return {
      ...(session.id ? { id: session.id } : {}),
      classId,
      sequenceNumber: index + 1,
      capacity: session.capacity,
      titleEn: session.titleEn,
      titleId: session.titleId ?? null,
      curriculumEn: session.curriculumEn ?? null,
      curriculumId: session.curriculumId ?? null,
      startAt: session.startAt,
      endAt: session.endAt,
      mode: session.mode,
      roomId: session.roomId ?? null,
      tutorId: session.tutorId,
      tutorFeeIdr: input.tutorFeeIdr,
      state: "draft",
    };
  }

  async function validateReferences(tx: DbOrTx, input: SaveDraftInput) {
    const competition = await repo.getCompetition(tx, input.competitionId);
    if (
      !competition ||
      !competition.isActive ||
      (competition.parentId !== null && competition.parent?.isActive !== true)
    ) {
      throw new AcademyClassInvalidOperationError(
        "Select an active competition or specialization",
        { competitionId: input.competitionId },
      );
    }

    if (input.kind === "cohort") {
      const firstStart = Math.min(
        ...input.sessions.map((session) => session.startAt.getTime()),
      );
      if (input.minimumCheckAt.getTime() >= firstStart) {
        throw new AcademyClassInvalidOperationError(
          "The minimum-enrollment check must be before the first session",
        );
      }
      if (
        input.minimumEnrollment >
        Math.min(...input.sessions.map((s) => s.capacity))
      ) {
        throw new AcademyClassInvalidOperationError(
          "Minimum enrollment cannot exceed any session capacity",
        );
      }
      for (const [index, session] of input.sessions.entries()) {
        if (!session.curriculumEn?.trim()) {
          throw new AcademyClassInvalidOperationError(
            "Cohort sessions require an English curriculum description",
            { session: index + 1 },
          );
        }
      }
    }

    const ordered = input.sessions.toSorted(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index]!.startAt < ordered[index - 1]!.endAt) {
        throw new AcademyClassInvalidOperationError(
          "Sessions in one class cannot overlap",
        );
      }
    }

    const tutorIds = [
      ...new Set(input.sessions.map((session) => session.tutorId)),
    ];
    const profiles = await repo.getTutorProfiles(tx, tutorIds);
    const profileById = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    for (const [index, session] of input.sessions.entries()) {
      const profile = profileById.get(session.tutorId);
      if (
        !profile ||
        profile.role !== "tutor" ||
        profile.onboardingStatus !== "published"
      ) {
        throw new AcademyClassInvalidOperationError(
          "Assign a published tutor profile to every session",
          { session: index + 1, tutorId: session.tutorId },
        );
      }
      const supportsMode =
        profile.modality === "both" ||
        (session.mode === "online" && profile.modality === "online") ||
        (session.mode === "in_person" && profile.modality === "offline");
      if (!supportsMode) {
        throw new AcademyClassInvalidOperationError(
          "The assigned tutor does not support this session mode",
          { session: index + 1, tutorId: session.tutorId },
        );
      }
      const maxClassSize =
        session.mode === "online"
          ? profile.onlineMaxClassSize
          : profile.offlineMaxClassSize;
      if (session.capacity > maxClassSize) {
        throw new AcademyClassInvalidOperationError(
          "Session capacity exceeds the tutor's maximum class size",
          { session: index + 1, maximum: maxClassSize },
        );
      }
    }

    const roomIds = [
      ...new Set(
        input.sessions.flatMap((session) =>
          session.mode === "in_person" && session.roomId
            ? [session.roomId]
            : [],
        ),
      ),
    ];
    const rooms = await repo.getRooms(tx, roomIds);
    const roomById = new Map(
      rooms.map((availableRoom) => [availableRoom.id, availableRoom]),
    );
    for (const [index, session] of input.sessions.entries()) {
      if (session.mode !== "in_person") continue;
      const selectedRoom = session.roomId
        ? roomById.get(session.roomId)
        : undefined;
      if (!selectedRoom) {
        throw new AcademyClassInvalidOperationError(
          "Select an active room for every in-person session",
          { session: index + 1, roomId: session.roomId },
        );
      }
      if (session.capacity > selectedRoom.capacity) {
        throw new AcademyClassInvalidOperationError(
          "Session capacity exceeds the selected room's capacity",
          { session: index + 1, maximum: selectedRoom.capacity },
        );
      }
    }
  }

  function auditSnapshot(
    record: NonNullable<Awaited<ReturnType<typeof repo.get>>>,
  ) {
    return {
      id: record.id,
      kind: record.kind,
      competitionId: record.competitionId,
      titleEn: record.titleEn,
      titleId: record.titleId,
      descriptionEn: record.descriptionEn,
      descriptionId: record.descriptionId,
      coverKey: record.coverKey,
      minimumEnrollment: record.minimumEnrollment,
      minimumCheckAt: record.minimumCheckAt,
      cohortFullRateMarks: record.cohortFullRateMarks,
      cohortHalfRateMarks: record.cohortHalfRateMarks,
      cohortSingleRateMarks: record.cohortSingleRateMarks,
      masterclassRateMarks: record.masterclassRateMarks,
      tutorFeeIdr: record.tutorFeeIdr,
      state: record.state,
      version: record.version,
      sessions: record.sessions.map((session) => ({
        id: session.id,
        sequenceNumber: session.sequenceNumber,
        capacity: session.capacity,
        titleEn: session.titleEn,
        titleId: session.titleId,
        curriculumEn: session.curriculumEn,
        curriculumId: session.curriculumId,
        startAt: session.startAt,
        endAt: session.endAt,
        mode: session.mode,
        roomId: session.roomId,
        tutorId: session.tutorId,
        tutorFeeIdr: session.tutorFeeIdr,
        state: session.state,
      })),
    };
  }

  async function saveDraft(actorId: string, input: SaveDraftInput) {
    return deps.db.transaction(async (tx) => {
      await validateReferences(tx, input);
      const now = new Date();

      if (!input.id) {
        if (input.sessions.some((session) => session.id)) {
          throw new AcademyClassInvalidOperationError(
            "New class sessions cannot include existing session IDs",
          );
        }
        const created = await repo.insertClass(tx, {
          ...classValues(input, actorId),
          state: "draft",
          postponementCount: 0,
          version: 1,
          createdBy: actorId,
        });
        await repo.insertSessions(
          tx,
          input.sessions.map((session, index) =>
            sessionValues(input, session, created.id, index),
          ),
        );
        const result = await repo.get(tx, created.id);
        if (!result) throw new AcademyClassNotFoundError(created.id);
        await deps.audit.record({
          db: tx,
          actorId,
          actorType: "admin",
          action: "academy_class.draft_created",
          targetId: result.id,
          targetType: "academy_class",
          afterState: auditSnapshot(result),
          details: { reason: input.reason },
        });
        return result;
      }

      const before = await repo.get(tx, input.id);
      if (!before) throw new AcademyClassNotFoundError(input.id);
      if (before.state !== "draft") {
        throw new AcademyClassStateConflictError(
          "Only draft classes can be edited",
          { id: input.id, state: before.state },
        );
      }
      if (before.version !== input.expectedVersion) {
        throw new AcademyClassVersionConflictError(
          before.id,
          input.expectedVersion!,
          before.version,
        );
      }

      const existingSessions = await repo.listSessionsForClass(tx, before.id);
      const existingById = new Map(
        existingSessions.map((session) => [session.id, session]),
      );
      const suppliedIds = input.sessions.flatMap((session) =>
        session.id ? [session.id] : [],
      );
      if (new Set(suppliedIds).size !== suppliedIds.length) {
        throw new AcademyClassInvalidOperationError(
          "A session cannot appear more than once in the draft",
        );
      }
      for (const sessionId of suppliedIds) {
        if (!existingById.has(sessionId)) {
          throw new AcademyClassInvalidOperationError(
            "Session does not belong to this draft class",
            { sessionId, classId: before.id },
          );
        }
      }

      const updated = await repo.updateClassVersioned(
        tx,
        before.id,
        input.expectedVersion!,
        {
          ...classValues(input, actorId),
          version: before.version + 1,
          updatedAt: now,
        },
      );
      if (!updated) {
        const current = await repo.get(tx, before.id);
        if (!current) throw new AcademyClassNotFoundError(before.id);
        throw new AcademyClassVersionConflictError(
          before.id,
          input.expectedVersion!,
          current.version,
        );
      }

      await repo.deleteSessionsExcept(tx, before.id, suppliedIds);
      await repo.shiftSessionSequences(tx, before.id, suppliedIds);
      const newSessions: (typeof academyClassSession.$inferInsert)[] = [];
      for (const [index, session] of input.sessions.entries()) {
        const values = sessionValues(input, session, before.id, index);
        if (session.id) {
          const saved = await repo.updateSession(
            tx,
            session.id,
            before.id,
            values,
          );
          if (!saved) {
            throw new AcademyClassStateConflictError(
              "A draft session changed while the class was being saved",
              { sessionId: session.id },
            );
          }
        } else {
          newSessions.push(values);
        }
      }
      await repo.insertSessions(tx, newSessions);

      const result = await repo.get(tx, before.id);
      if (!result) throw new AcademyClassNotFoundError(before.id);
      await deps.audit.record({
        db: tx,
        actorId,
        actorType: "admin",
        action: "academy_class.draft_updated",
        targetId: result.id,
        targetType: "academy_class",
        beforeState: auditSnapshot(before),
        afterState: auditSnapshot(result),
        details: { reason: input.reason },
      });
      return result;
    });
  }

  return { list, get, saveDraft };
}
