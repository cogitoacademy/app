import { describe, test, expect, mock } from "bun:test";
import { createTutorHandler } from "../../modules/tutor/tutor.handler";
import {
  TutorProfileNotFoundError,
  InvalidTutorStatusError,
  AvailabilitySlotOverlapError,
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
    test("calls tutor.submitForReview with userId", async () => {
      const submitForReview = mock(async () => ({
        id: "t1",
        status: "pending_review",
      }));
      const tutorService = { submitForReview } as any;
      const handler = createTutorHandler(tutorService);
      const context = { session: { user: { id: "u1" } } } as any;

      const result = await handler.submitForReview({ context });

      expect(submitForReview).toHaveBeenCalledWith("u1");
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
        await handler.submitForReview({ context });
        expect.unreachable("Should have thrown");
      } catch (err: any) {
        expect(err.status).toBe(409);
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
