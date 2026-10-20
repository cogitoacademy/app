import { academyClassSession } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx, TxClient } from "../../lib/tx";
import { lockRoomForBooking, lockTutorForBooking } from "../../lib/locks";
import { lockCompetitionCatalog } from "../competition-catalog/catalog-lock";
import { log } from "../../lib/logger";
import {
  BOOKING_STATES,
  TERMINAL_STATES,
} from "../booking/booking-state.types";
import type { AuditPort } from "../audit/audit.service";
import type { InAppNotificationPort } from "../notification/notification.service";
import type { MeetingPort } from "../meeting/meeting.types";
import {
  AcademyClassInvalidOperationError,
  AcademyClassNotFoundError,
  AcademyClassStateConflictError,
  AcademyClassVersionConflictError,
} from "./academy-class.errors";
import { createAcademyClassRepo } from "./academy-class.repo";
import { toPublicAcademyClass } from "./academy-class.public";
import {
  publishAcademyClassInput,
  retryAcademyClassMeetingsInput,
  listAcademyClassesInput,
  saveAcademyClassDraftInput,
} from "./academy-class.types";
import type { z } from "zod";

export type AcademyClassService = ReturnType<typeof createAcademyClassService>;
type SaveDraftInput = z.infer<typeof saveAcademyClassDraftInput>;
type SessionDraftInput = SaveDraftInput["sessions"][number];
type PublishInput = z.infer<typeof publishAcademyClassInput>;
type RetryMeetingsInput = z.infer<typeof retryAcademyClassMeetingsInput>;

const ACTIVE_BOOKING_STATES = BOOKING_STATES.filter(
  (state) => !TERMINAL_STATES.includes(state),
);
const APPROVED_TUTOR_FEE_IDR = {
  cohort: 400_000,
  masterclass: 300_000,
} as const;
const MEETING_LEASE_MS = 5 * 60 * 1000;
const MAX_MEETING_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

export function createAcademyClassService(deps: {
  db: DbType;
  audit: AuditPort;
  meeting: MeetingPort;
  notification: Pick<InAppNotificationPort, "write">;
}) {
  const repo = createAcademyClassRepo();

  async function list(input: z.infer<typeof listAcademyClassesInput>) {
    return repo.list(deps.db, input);
  }

  async function get(id: string) {
    const record = await repo.get(deps.db, id);
    if (!record) throw new AcademyClassNotFoundError(id);
    return record;
  }

  async function listPublished() {
    const records = await repo.list(deps.db, { state: "published" });
    return records.map(toPublicAcademyClass);
  }

  async function getPublished(id: string) {
    const record = await repo.get(deps.db, id);
    if (!record || record.state !== "published") {
      throw new AcademyClassNotFoundError(id);
    }
    return toPublicAcademyClass(record);
  }

  async function validatePublishReferences(
    tx: TxClient,
    record: NonNullable<Awaited<ReturnType<typeof repo.get>>>,
  ) {
    const approvedTutorFee =
      record.kind === "cohort"
        ? APPROVED_TUTOR_FEE_IDR.cohort
        : record.kind === "masterclass"
          ? APPROVED_TUTOR_FEE_IDR.masterclass
          : undefined;
    if (!approvedTutorFee || record.tutorFeeIdr !== approvedTutorFee) {
      throw new AcademyClassInvalidOperationError(
        `The approved ${record.kind} tutor fee is Rp${(approvedTutorFee ?? 0).toLocaleString("en-US")} per session`,
        approvedTutorFee ? { expectedTutorFeeIdr: approvedTutorFee } : {},
      );
    }
    if (record.sessions.length === 0) {
      throw new AcademyClassInvalidOperationError(
        "A class needs at least one session before it can be published",
      );
    }
    if (record.kind === "masterclass" && record.sessions.length !== 1) {
      throw new AcademyClassInvalidOperationError(
        "Masterclasses must contain exactly one session",
      );
    }
    if (
      record.kind === "cohort" &&
      record.sessions.some((s) => !s.curriculumEn?.trim())
    ) {
      throw new AcademyClassInvalidOperationError(
        "Cohort sessions require an English curriculum description",
      );
    }
    if (record.kind === "cohort") {
      const firstStart = Math.min(
        ...record.sessions.map((session) => session.startAt.getTime()),
      );
      if (
        !record.minimumCheckAt ||
        record.minimumCheckAt.getTime() >= firstStart
      ) {
        throw new AcademyClassInvalidOperationError(
          "The minimum-enrollment check must be before the first session",
        );
      }
      if (
        !record.minimumEnrollment ||
        record.minimumEnrollment >
          Math.min(...record.sessions.map((s) => s.capacity))
      ) {
        throw new AcademyClassInvalidOperationError(
          "Minimum enrollment cannot exceed any session capacity",
        );
      }
    }

    const tutorIds = [
      ...new Set(record.sessions.map((session) => session.tutorId)),
    ];
    const roomIds = [
      ...new Set(
        record.sessions.flatMap((session) =>
          session.mode === "in_person" && session.roomId
            ? [session.roomId]
            : [],
        ),
      ),
    ];

    // Keep mutable reference reads after the same locks used by the catalog,
    // booking, and room writers. The sorted per-resource lock order prevents
    // overlapping multi-session classes from acquiring tutors/rooms in
    // opposite orders.
    await lockCompetitionCatalog(tx);
    for (const tutorId of [...tutorIds].toSorted()) {
      await lockTutorForBooking(tx, tutorId);
    }
    for (const roomId of [...roomIds].toSorted()) {
      await lockRoomForBooking(tx, roomId);
    }

    const competition = await repo.getCompetitionForPublish(
      tx,
      record.competitionId,
    );
    if (
      !competition ||
      !competition.isActive ||
      (competition.parentId !== null && competition.parent?.isActive !== true)
    ) {
      throw new AcademyClassInvalidOperationError(
        "The assigned competition or specialization is archived",
        { competitionId: record.competitionId },
      );
    }

    const profiles = await repo.getTutorProfiles(tx, tutorIds, true);
    const profileById = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const rooms = await repo.getRooms(tx, roomIds, true);
    const roomById = new Map(
      rooms.map((availableRoom) => [availableRoom.id, availableRoom]),
    );
    const ordered = record.sessions.toSorted(
      (left, right) => left.startAt.getTime() - right.startAt.getTime(),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index]!.startAt < ordered[index - 1]!.endAt) {
        throw new AcademyClassInvalidOperationError(
          "Sessions in one class cannot overlap",
        );
      }
    }

    const now = new Date();
    for (const [index, session] of record.sessions.entries()) {
      const profile = profileById.get(session.tutorId);
      if (
        !profile ||
        profile.role !== "tutor" ||
        profile.onboardingStatus !== "published"
      ) {
        throw new AcademyClassInvalidOperationError(
          "Assign a published tutor profile to every session before publishing",
          { session: index + 1, tutorId: session.tutorId },
        );
      }
      const supportsMode =
        profile.modality === "both" ||
        (session.mode === "online" && profile.modality === "online") ||
        (session.mode === "in_person" && profile.modality === "offline");
      if (!supportsMode) {
        throw new AcademyClassInvalidOperationError(
          "The assigned tutor no longer supports this session mode",
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
      if (
        session.tutorFeeIdr < 1 ||
        session.tutorFeeIdr !== record.tutorFeeIdr
      ) {
        throw new AcademyClassInvalidOperationError(
          "Every session must use the class's approved flat tutor fee",
          { session: index + 1 },
        );
      }
      if (session.startAt <= now) {
        throw new AcademyClassInvalidOperationError(
          "Sessions must start in the future when the class is published",
          { session: index + 1 },
        );
      }

      if (session.mode === "online") {
        if (session.roomId !== null) {
          throw new AcademyClassInvalidOperationError(
            "Online sessions cannot be assigned an in-person room",
            { session: index + 1 },
          );
        }
      } else {
        const selectedRoom = session.roomId
          ? roomById.get(session.roomId)
          : undefined;
        if (!selectedRoom) {
          throw new AcademyClassInvalidOperationError(
            "Select an active managed room for every in-person session",
            { session: index + 1, roomId: session.roomId },
          );
        }
        if (session.capacity > selectedRoom.capacity) {
          throw new AcademyClassInvalidOperationError(
            "Session capacity exceeds the selected room's capacity",
            { session: index + 1, maximum: selectedRoom.capacity },
          );
        }
        const roomBookingOverlap = await repo.findRoomBookingOverlap(
          tx,
          selectedRoom.id,
          session.startAt,
          session.endAt,
        );
        const roomClassOverlap = await repo.findRoomClassOverlap(
          tx,
          record.id,
          selectedRoom.id,
          session.startAt,
          session.endAt,
        );
        if (roomBookingOverlap || roomClassOverlap) {
          throw new AcademyClassInvalidOperationError(
            "The selected managed room is already booked for this session",
            { session: index + 1, roomId: selectedRoom.id },
          );
        }
      }

      const tutorBookingOverlap = await repo.findTutorBookingOverlap(
        tx,
        session.tutorId,
        session.startAt,
        session.endAt,
        ACTIVE_BOOKING_STATES,
      );
      const tutorClassOverlap = await repo.findTutorClassOverlap(
        tx,
        record.id,
        session.tutorId,
        session.startAt,
        session.endAt,
      );
      if (tutorBookingOverlap || tutorClassOverlap) {
        throw new AcademyClassInvalidOperationError(
          "The assigned tutor is already scheduled during this session",
          { session: index + 1, tutorId: session.tutorId },
        );
      }
    }
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

  async function runMeetingAttempt(meetingId: string) {
    const now = new Date();
    const claimed = await deps.db.transaction((tx) =>
      repo.claimMeeting(
        tx,
        meetingId,
        now,
        new Date(now.getTime() - MEETING_LEASE_MS),
      ),
    );
    if (!claimed) return null;

    const attempt = await repo.findMeetingAttemptDetails(deps.db, meetingId);
    let result: {
      provider: string;
      status: "created" | "failed";
      externalEventId: string | null;
      meetingUrl: string | null;
      errorReason: string | null;
    };
    try {
      if (!attempt || attempt.academyClass.state !== "published") {
        throw new Error(
          "Published class meeting work no longer has a class session",
        );
      }
      const createEvent = deps.meeting.createAcademyClassEvent;
      if (!createEvent) {
        throw new Error("Class meeting provider is not configured");
      }
      result = await createEvent(
        attempt.session.id,
        attempt.session.startAt,
        attempt.session.endAt,
        { email: attempt.tutorEmail, name: attempt.tutorName },
        {
          title: `Cogito ${attempt.academyClass.titleEn}: ${attempt.session.titleEn}`,
          externalEventId: attempt.meeting.externalEventId ?? undefined,
        },
      );
    } catch (error) {
      result = {
        provider: "manual",
        status: "failed",
        externalEventId: null,
        meetingUrl: null,
        errorReason: String(error),
      };
    }

    if (
      result.status === "created" &&
      (result.provider !== "google_meet" || !result.meetingUrl?.trim())
    ) {
      result = {
        ...result,
        status: "failed",
        errorReason:
          result.errorReason ??
          (result.provider !== "google_meet"
            ? "A Google Meet link is required before a class session is ready"
            : "The Google Meet link is still pending"),
      };
    }

    const retryDelay = Math.min(
      MAX_MEETING_RETRY_DELAY_MS,
      30_000 * 2 ** Math.min(10, Math.max(0, claimed.attemptCount - 1)),
    );
    await repo.finishMeetingAttempt(deps.db, meetingId, {
      provider: result.provider,
      status: result.status,
      externalEventId:
        result.externalEventId ?? attempt?.meeting.externalEventId ?? null,
      meetingUrl: result.meetingUrl,
      errorReason: result.errorReason,
      nextRetryAt:
        result.status === "created"
          ? now
          : new Date(now.getTime() + retryDelay),
    });
    return result.status;
  }

  async function processReadyMeetings(classId?: string) {
    const now = new Date();
    const ready = await repo.listReadyMeetingIds(
      deps.db,
      now,
      new Date(now.getTime() - MEETING_LEASE_MS),
      100,
      classId,
    );
    let created = 0;
    let failed = 0;
    for (let index = 0; index < ready.length; index += 4) {
      const outcomes = await Promise.all(
        ready.slice(index, index + 4).map(({ id }) => runMeetingAttempt(id)),
      );
      created += outcomes.filter((outcome) => outcome === "created").length;
      failed += outcomes.filter((outcome) => outcome === "failed").length;
    }
    return { processed: created + failed, created, failed };
  }

  async function publish(actorId: string, input: PublishInput) {
    const published = await deps.db.transaction(async (tx) => {
      const locked = await repo.lockClassForPublish(tx, input.id);
      if (!locked) throw new AcademyClassNotFoundError(input.id);
      const before = await repo.get(tx, input.id);
      if (!before) throw new AcademyClassNotFoundError(input.id);
      if (before.version !== input.expectedVersion) {
        throw new AcademyClassVersionConflictError(
          before.id,
          input.expectedVersion,
          before.version,
        );
      }
      if (before.state !== "draft") {
        throw new AcademyClassStateConflictError(
          "Only a class draft can be published",
          { id: input.id, state: before.state },
        );
      }

      await validatePublishReferences(tx, before);
      const now = new Date();
      const updated = await repo.publishClassVersioned(
        tx,
        before.id,
        input.expectedVersion,
        actorId,
        now,
      );
      if (!updated) {
        const current = await repo.get(tx, before.id);
        if (!current) throw new AcademyClassNotFoundError(before.id);
        throw new AcademyClassVersionConflictError(
          before.id,
          input.expectedVersion,
          current.version,
        );
      }
      const sessions = await repo.publishSessions(tx, before.id);
      const onlineSessionIds = sessions
        .filter((session) => session.mode === "online")
        .map((session) => session.id);
      await repo.insertMeetingJobs(tx, onlineSessionIds);

      const after = await repo.get(tx, before.id);
      if (!after) throw new AcademyClassNotFoundError(before.id);
      await deps.audit.record({
        db: tx,
        actorId,
        actorType: "admin",
        action: "academy_class.published",
        targetId: after.id,
        targetType: "academy_class",
        beforeState: auditSnapshot(before),
        afterState: auditSnapshot(after),
        details: {
          reason: input.reason,
          onlineMeetingCount: onlineSessionIds.length,
        },
      });

      const tutorIds = [...new Set(sessions.map((session) => session.tutorId))];
      for (const tutorId of tutorIds) {
        await deps.notification.write({
          db: tx,
          userId: tutorId,
          category: "schedule",
          severity: "action",
          title: "A class you teach was published",
          body: `${after.titleEn} is published with ${sessions.filter((session) => session.tutorId === tutorId).length} assigned session(s).`,
          eventKey: `academy_class_published:${after.id}:tutor:${tutorId}`,
          metadata: {
            classId: after.id,
            classTitle: after.titleEn,
          },
        });
      }
      return after;
    });

    try {
      await processReadyMeetings(input.id);
    } catch (error) {
      log({
        level: "error",
        action: "academy_class_meeting_dispatch_failed",
        classId: input.id,
        error: { message: String(error) },
      });
    }
    return (await repo.get(deps.db, input.id)) ?? published;
  }

  async function retryMeetings(actorId: string, input: RetryMeetingsInput) {
    await deps.db.transaction(async (tx) => {
      const locked = await repo.lockClassForPublish(tx, input.id);
      if (!locked) throw new AcademyClassNotFoundError(input.id);
      const record = await repo.get(tx, input.id);
      if (!record) throw new AcademyClassNotFoundError(input.id);
      if (record.state !== "published") {
        throw new AcademyClassStateConflictError(
          "Only published class meetings can be retried",
          { id: input.id, state: record.state },
        );
      }
      const queued = await repo.queueFailedClassMeetings(
        tx,
        input.id,
        new Date(),
      );
      if (queued.length === 0) {
        throw new AcademyClassStateConflictError(
          "This class has no failed meeting setup to retry",
          { id: input.id },
        );
      }
      await deps.audit.record({
        db: tx,
        actorId,
        actorType: "admin",
        action: "academy_class.meetings_retry_requested",
        targetId: record.id,
        targetType: "academy_class",
        details: { reason: input.reason, meetingCount: queued.length },
      });
    });
    await processReadyMeetings(input.id);
    const record = await repo.get(deps.db, input.id);
    if (!record) throw new AcademyClassNotFoundError(input.id);
    return record;
  }

  async function retryFailedMeetings() {
    const result = await processReadyMeetings();
    return { succeeded: result.created, failed: result.failed };
  }

  return {
    list,
    get,
    listPublished,
    getPublished,
    saveDraft,
    publish,
    retryMeetings,
    retryFailedMeetings,
  };
}
