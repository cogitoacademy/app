import { describe, test, expect, mock } from "bun:test";
import { tutorHandlers } from "../../modules/tutor/tutor.handlers";

describe("tutorHandlers", () => {
  describe("getMyProfile", () => {
    test("calls tutor.getMyProfile with userId", async () => {
      const getMyProfile = mock(async () => ({ id: "t1", userId: "u1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { getMyProfile } },
      };

      const result = await tutorHandlers.getMyProfile({ context });

      expect(getMyProfile).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "t1", userId: "u1" });
    });
  });

  describe("updateMyProfile", () => {
    test("calls tutor.updateMyProfile with userId and input", async () => {
      const updateMyProfile = mock(async () => ({ id: "t1", userId: "u1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { updateMyProfile } },
      };
      const input = { displayName: "Tutor 1" };

      const result = await tutorHandlers.updateMyProfile({ context, input });

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
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { submitForReview } },
      };

      const result = await tutorHandlers.submitForReview({ context });

      expect(submitForReview).toHaveBeenCalledWith("u1");
      expect(result).toEqual({ id: "t1", status: "pending_review" });
    });
  });

  describe("listAvailability", () => {
    test("calls tutor.listAvailability with userId", async () => {
      const listAvailability = mock(async () => [{ id: "slot1" }]);
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { listAvailability } },
      };

      const result = await tutorHandlers.listAvailability({ context });

      expect(listAvailability).toHaveBeenCalledWith("u1");
      expect(result).toEqual([{ id: "slot1" }]);
    });
  });

  describe("upsertAvailability", () => {
    test("calls tutor.upsertAvailability with userId and input", async () => {
      const upsertAvailability = mock(async () => ({ id: "slot1" }));
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { upsertAvailability } },
      };
      const input = {
        startDate: "2024-01-01T00:00:00Z",
        endDate: "2024-01-01T01:00:00Z",
        modality: "online" as const,
      };

      const result = await tutorHandlers.upsertAvailability({ context, input });

      expect(upsertAvailability).toHaveBeenCalledWith("u1", input);
      expect(result).toEqual({ id: "slot1" });
    });
  });

  describe("deleteAvailability", () => {
    test("calls tutor.deleteAvailability with userId and input.id", async () => {
      const deleteAvailability = mock(async () => undefined);
      const context = {
        session: { user: { id: "u1" } },
        services: { tutor: { deleteAvailability } },
      };
      const input = { id: "slot1" };

      await tutorHandlers.deleteAvailability({ context, input });

      expect(deleteAvailability).toHaveBeenCalledWith("u1", "slot1");
    });
  });
});
