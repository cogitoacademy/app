import { describe, test, expect, mock } from "bun:test";
import {
  buildProjection,
  createDiscoveryService,
  type ProfileWithUser,
} from "../../modules/tutor-discovery/discovery.service";
import { TutorProfileNotFoundError } from "../../modules/tutor-discovery/discovery.errors";
import type { DiscoveryRepo } from "../../modules/tutor-discovery/discovery.repo";

function makeProfile(
  overrides: Partial<ProfileWithUser> = {},
): ProfileWithUser {
  return {
    id: "tp1",
    displayName: "Dr. Smith",
    shortBio: "Experienced tutor",
    credentialsSummary: "PhD Math",
    expertise: ["algebra", "calculus"],
    modality: "online",
    prices: { "1": 50, "2": 40 },
    availabilitySummary: "Weekdays",
    proofUrls: ["https://proof.example.com/cert.pdf"],
    publishedAt: new Date("2025-01-01"),
    userId: "u1",
    onboardingStatus: "published",
    inviteId: "inv1",
    adminReviewNote: null,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { name: "Dr. Smith", image: "https://img.example.com/smith.jpg" },
    ...overrides,
  } as unknown as ProfileWithUser;
}

function makeRepo(overrides: Partial<DiscoveryRepo> = {}): DiscoveryRepo {
  return {
    listPublished: mock(async () => []),
    getProfileById: mock(async () => null),
    listFutureAvailability: mock(async () => []),
    ...overrides,
  } as DiscoveryRepo;
}

describe("Discovery Service", () => {
  describe("buildProjection", () => {
    test("maps profile fields to public projection", () => {
      const profile = makeProfile();
      const result = buildProjection(profile);
      expect(result.id).toBe("tp1");
      expect(result.userId).toBe("u1");
      expect(result.displayName).toBe("Dr. Smith");
      expect(result.shortBio).toBe("Experienced tutor");
      expect(result.credentialsSummary).toBe("PhD Math");
      expect(result.expertise).toEqual(["algebra", "calculus"]);
      expect(result.modality).toBe("online");
      expect(result.prices).toEqual({ "1": 50, "2": 40 });
      expect(result.availabilitySummary).toBe("Weekdays");
      expect(result.proofUrls).toEqual(["https://proof.example.com/cert.pdf"]);
      expect(result.publishedAt).toEqual(new Date("2025-01-01"));
    });

    test("includes user name and image when user is present", () => {
      const result = buildProjection(makeProfile());
      expect(result.user).toEqual({
        name: "Dr. Smith",
        image: "https://img.example.com/smith.jpg",
      });
    });

    test("returns null user when user is null", () => {
      const result = buildProjection(makeProfile({ user: null }));
      expect(result.user).toBeNull();
    });

    test("defaults expertise to empty array when null", () => {
      const result = buildProjection(makeProfile({ expertise: null as any }));
      expect(result.expertise).toEqual([]);
    });
  });

  describe("listPublished", () => {
    test("calls repo.listPublished and maps results", async () => {
      const profile = makeProfile();
      const listPublished = mock(async () => [profile]);
      const repo = makeRepo({ listPublished });

      const service = createDiscoveryService({ repo });
      const result = await service.listPublished({ search: "math" });

      expect(listPublished).toHaveBeenCalledWith({
        search: "math",
        expertise: undefined,
        categoryId: undefined,
        subjectId: undefined,
        categoryIds: undefined,
        subjectIds: undefined,
        modality: undefined,
        limit: 20,
        offset: 0,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("tp1");
    });

    test("passes custom limit and offset to repo", async () => {
      const listPublished = mock(async () => []);
      const repo = makeRepo({ listPublished });

      const service = createDiscoveryService({ repo });
      await service.listPublished({ limit: 10, offset: 5 });

      expect(listPublished).toHaveBeenCalledWith({
        search: undefined,
        expertise: undefined,
        categoryId: undefined,
        subjectId: undefined,
        categoryIds: undefined,
        subjectIds: undefined,
        modality: undefined,
        limit: 10,
        offset: 5,
      });
    });

    test("passes multiple category and subject filters to the repo", async () => {
      const listPublished = mock(async () => []);
      const repo = makeRepo({ listPublished });
      const service = createDiscoveryService({ repo });

      await service.listPublished({
        categoryIds: ["category-1", "category-2"],
        subjectIds: ["subject-1", "subject-2"],
      });

      expect(listPublished).toHaveBeenCalledWith({
        search: undefined,
        expertise: undefined,
        categoryId: undefined,
        subjectId: undefined,
        categoryIds: ["category-1", "category-2"],
        subjectIds: ["subject-1", "subject-2"],
        modality: undefined,
        limit: 20,
        offset: 0,
      });
    });

    test("returns empty array when no profiles", async () => {
      const repo = makeRepo({ listPublished: mock(async () => []) });
      const service = createDiscoveryService({ repo });

      const result = await service.listPublished();
      expect(result).toEqual([]);
    });
  });

  describe("getProfile", () => {
    test("returns projected profile when found", async () => {
      const profile = makeProfile();
      const getProfileById = mock(async () => profile);
      const availabilitySlots = [
        {
          id: "slot1",
          tutorId: "u1",
          startDate: new Date("2026-09-01T09:00:00Z"),
          endDate: new Date("2026-09-01T10:00:00Z"),
          modality: "both",
          isRecurring: false,
          recurrenceRule: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const listFutureAvailability = mock(async () => availabilitySlots);
      const repo = makeRepo({ getProfileById, listFutureAvailability });

      const service = createDiscoveryService({ repo });
      const result = await service.getProfile("tp1");

      expect(getProfileById).toHaveBeenCalledWith("tp1");
      expect(listFutureAvailability).toHaveBeenCalledWith("u1");
      expect(result.id).toBe("tp1");
      expect(result.availabilitySlots).toEqual(availabilitySlots);
    });

    test("throws TutorProfileNotFoundError when not found", async () => {
      const repo = makeRepo({ getProfileById: mock(async () => null) });
      const service = createDiscoveryService({ repo });

      try {
        await service.getProfile("missing");
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(TutorProfileNotFoundError);
        expect((e as TutorProfileNotFoundError).details).toEqual({
          id: "missing",
        });
      }
    });
  });
});
