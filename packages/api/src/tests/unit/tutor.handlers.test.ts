import { describe, test, expect, mock } from "bun:test";
import { createTutorHandler } from "../../modules/tutor/tutor.handler";
import {
  TutorProfileNotFoundError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
  WeeklyAvailabilityRangeError,
  TutorTermsNotAcceptedError,
} from "../../modules/tutor/tutor.errors";

describe("tutorHandlers", () => {
  describe("getMyProfile", () => {
    test("calls tutor.getMyProfile with userId", async () => {
      const getMyProfile = mock(async () => ({ id: "t1", userId: "u1" }));
      const tutorService = { getMyProfile } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      const result = await handler.getMyProfile({ context });

      expect(getMyProfile).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "t1", userId: "u1" });
    });

    test("maps TutorProfileNotFoundError to 404", async () => {
      const getMyProfile = mock(async () => {
        throw new TutorProfileNotFoundError("u1");
      });
      const tutorService = { getMyProfile } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      try {
        await handler.getMyProfile({ context });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(404);
      }
    });
  });

  describe("getMyProfileHistory", () => {
    test("calls tutor.getMyProfileHistory with userId", async () => {
      const getMyProfileHistory = mock(async () => [{ id: "audit-1" }]);
      const tutorService = { getMyProfileHistory } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      const result = await handler.getMyProfileHistory({ context });

      expect(getMyProfileHistory).toHaveBeenCalledWith("u1");
      expect(result).toEqual([{ id: "audit-1" }]);
    });
  });

  describe("updateMyProfile", () => {
    test("calls tutor.updateMyProfile with userId and input", async () => {
      const updateMyProfile = mock(async () => ({ id: "t1", userId: "u1" }));
      const tutorService = { updateMyProfile } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { displayName: "Tutor 1" };

      const result = await handler.updateMyProfile({ context, input });

      expect(updateMyProfile).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "t1", userId: "u1" });
    });
  });

  describe("submitForReview", () => {
    test("calls tutor.submitForReview with userId and input", async () => {
      const submitForReview = mock(async () => ({
        id: "t1",
        status: "pending_review",
      }));
      const tutorService = { submitForReview } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { acceptTerms: true };

      const result = await handler.submitForReview({ context, input });

      expect(submitForReview).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "t1", status: "pending_review" });
    });

    test("maps InvalidTutorStatusError to 409", async () => {
      const submitForReview = mock(async () => {
        throw new InvalidTutorStatusError("t1", "published");
      });
      const tutorService = { submitForReview } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      try {
        await handler.submitForReview({ context, input: {} });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(409);
      }
    });

    test("maps missing tutor terms acceptance to 400", async () => {
      const submitForReview = mock(async () => {
        throw new TutorTermsNotAcceptedError("t1", "2026-09");
      });
      const handler = createTutorHandler({ submitForReview } as any);
      const context = { session: { user: { id: "u1" } } } as any;

      try {
        await handler.submitForReview({ context, input: {} });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(400);
        expect(err.data).toEqual({ termsVersion: "2026-09" });
      }
    });
  });

  describe("listAvailability", () => {
    test("calls tutor.listAvailability with userId", async () => {
      const listAvailability = mock(async () => [{ id: "slot1" }]);
      const tutorService = { listAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      const result = await handler.listAvailability({ context });

      expect(listAvailability).toHaveBeenCalledWith("u1");
      expect(result).toEqual([{ id: "slot1" }]);
    });
  });

  describe("upsertAvailability", () => {
    test("calls tutor.upsertAvailability with userId and input", async () => {
      const upsertAvailability = mock(async () => ({ id: "slot1" }));
      const tutorService = { upsertAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-01T01:00:00Z",
        modality: "online" as const,
      };

      const result = await handler.upsertAvailability({ context, input });

      expect(upsertAvailability).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "slot1" });
    });

    test("maps AvailabilitySlotOverlapError to 409", async () => {
      const upsertAvailability = mock(async () => {
        throw new AvailabilitySlotOverlapError("u1");
      });
      const tutorService = { upsertAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-01T01:00:00Z",
        modality: "online" as const,
      };

      try {
        await handler.upsertAvailability({ context, input });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(409);
      }
    });
  });

  describe("createWeeklyAvailability", () => {
    test("calls tutor.createWeeklyAvailability with userId and input", async () => {
      const createWeeklyAvailability = mock(async () => [{ id: "slot1" }]);
      const tutorService = { createWeeklyAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = {
        startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
        ),
        repeatUntil: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
        modality: "online" as const,
      };

      const result = await handler.createWeeklyAvailability({
        context,
        input,
      });

      expect(createWeeklyAvailability).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual([{ id: "slot1" }]);
    });

    test("maps WeeklyAvailabilityRangeError to 400", async () => {
      const createWeeklyAvailability = mock(async () => {
        throw new WeeklyAvailabilityRangeError();
      });
      const tutorService = { createWeeklyAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = {
        startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        endDate: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000,
        ),
        repeatUntil: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
        modality: "online" as const,
      };

      try {
        await handler.createWeeklyAvailability({ context, input });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });
  });

  describe("replaceWeeklyAvailability", () => {
    test("calls tutor.replaceWeeklyAvailability with the authenticated tutor", async () => {
      const replaceWeeklyAvailability = mock(async () => [{ id: "slot1" }]);
      const handler = createTutorHandler({ replaceWeeklyAvailability } as any);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = {
        effectiveFrom: new Date("2026-08-17T00:00:00+07:00"),
        repeatUntil: new Date("2026-09-17T23:59:59+07:00"),
        ranges: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            modality: "online" as const,
          },
        ],
      };

      const result = await handler.replaceWeeklyAvailability({
        context,
        input,
      });

      expect(replaceWeeklyAvailability).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual([{ id: "slot1" }]);
    });
  });

  describe("deleteAvailability", () => {
    test("calls tutor.deleteAvailability with userId and input.id", async () => {
      const deleteAvailability = mock(async () => undefined);
      const tutorService = { deleteAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { id: "slot1" };

      await handler.deleteAvailability({ context, input });

      expect(deleteAvailability).toHaveBeenCalledWith("u1", "slot1");
    });

    test("maps TutorProfileNotFoundError to 404", async () => {
      const deleteAvailability = mock(async () => {
        throw new TutorProfileNotFoundError("u1");
      });
      const tutorService = { deleteAvailability } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;
      const input = { id: "slot1" };

      try {
        await handler.deleteAvailability({ context, input });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(404);
      }
    });
  });
});
