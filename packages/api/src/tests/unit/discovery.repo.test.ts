import { describe, test, expect, mock } from "bun:test";
import { createDiscoveryRepo } from "../../modules/tutor-discovery/discovery.repo";

const repo = createDiscoveryRepo();

describe("DiscoveryRepo", () => {
  describe("listPublished", () => {
    test("returns profiles with no filters", async () => {
      const profiles = [{ id: "tp1", displayName: "Dr. Smith" }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listPublished(conn, {});

      expect(result).toEqual(profiles);
    });

    test("filters by modality", async () => {
      const profiles = [{ id: "tp1", modality: "online" }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listPublished(conn, { modality: "online" });

      expect(result).toEqual(profiles);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    test("filters by search term", async () => {
      const profiles = [{ id: "tp1", displayName: "Math Tutor" }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listPublished(conn, { search: "math" });

      expect(result).toEqual(profiles);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    test("filters by expertise", async () => {
      const profiles = [{ id: "tp1", expertise: ["algebra"] }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listPublished(conn, { expertise: "algebra" });

      expect(result).toEqual(profiles);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    test("combines multiple filters", async () => {
      const profiles = [{ id: "tp1" }];
      const findMany = mock(async () => profiles);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      const result = await repo.listPublished(conn, {
        modality: "online",
        search: "math",
        expertise: "algebra",
      });

      expect(result).toEqual(profiles);
      expect(findMany).toHaveBeenCalledTimes(1);
      const callArg = findMany.mock.calls[0][0];
      expect(callArg.where).toBeDefined();
    });

    test("uses default limit and offset", async () => {
      const findMany = mock(async () => []);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      await repo.listPublished(conn, {});

      const callArg = findMany.mock.calls[0][0];
      expect(callArg.limit).toBe(20);
      expect(callArg.offset).toBe(0);
    });

    test("uses custom limit and offset", async () => {
      const findMany = mock(async () => []);
      const conn = {
        query: {
          tutorProfile: { findMany },
        },
      } as any;

      await repo.listPublished(conn, { limit: 10, offset: 5 });

      const callArg = findMany.mock.calls[0][0];
      expect(callArg.limit).toBe(10);
      expect(callArg.offset).toBe(5);
    });
  });

  describe("getProfileById", () => {
    test("returns profile when found", async () => {
      const profile = { id: "tp1", displayName: "Dr. Smith" };
      const findFirst = mock(async () => profile);
      const conn = {
        query: {
          tutorProfile: { findFirst },
        },
      } as any;

      const result = await repo.getProfileById(conn, "tp1");

      expect(result).toEqual(profile);
      expect(findFirst).toHaveBeenCalledTimes(1);
    });

    test("returns undefined when not found", async () => {
      const findFirst = mock(async () => undefined);
      const conn = {
        query: {
          tutorProfile: { findFirst },
        },
      } as any;

      const result = await repo.getProfileById(conn, "missing");

      expect(result).toBeUndefined();
    });
  });
});
