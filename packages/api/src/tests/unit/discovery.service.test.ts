import { describe, test, expect, mock } from "bun:test";
import {
  buildProjection,
  createDiscoveryService,
  type ProfileWithUser,
} from "../../modules/tutor-discovery/discovery.service";
import { TutorProfileNotFoundError } from "../../modules/tutor-discovery/discovery.errors";
import type { DiscoveryRepo } from "../../modules/tutor-discovery/discovery.repo";
import { createPricingService } from "../../modules/pricing/pricing.service";
import { DEFAULT_ECONOMY_CONFIG } from "../../modules/economy";

function makeProfile(
  overrides: Partial<ProfileWithUser> = {},
): ProfileWithUser {
  return {
    id: "tp1",
    displayName: "Dr. Smith",
    shortBio: "Experienced tutor",
    credentialsSummary: "PhD Math",
    achievements: "National medalist",
    experiences: "Math tutor",
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
      expect(result.achievements).toBe("National medalist");
      expect(result.experiences).toBe("Math tutor");
      expect(result.expertise).toEqual(["algebra", "calculus"]);
      expect(result.modality).toBe("online");
      expect(result.prices).toEqual({ "1": 50, "2": 40 });
      expect(result).not.toHaveProperty("availabilitySummary");
      expect(result).not.toHaveProperty("proofUrls");
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

    test("uses online as the default modality for IDR profiles without a modality", async () => {
      const profile = makeProfile({
        modality: null as any,
        baseRatesIdr: { online: 175_000 },
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const service = createDiscoveryService({ repo, pricing });
      const result = await service.listPublished();

      expect(result[0]?.pricesByModality?.online).toBeDefined();
      expect(result[0]?.pricesByModality?.offline).toBeUndefined();
    });

    test("projects current Marks prices from IDR base rates and economy config", async () => {
      const profile = makeProfile({
        modality: "both",
        baseRatesIdr: { online: 175_000, offline: 225_000 },
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const service = createDiscoveryService({ repo, pricing });
      const result = await service.listPublished();

      expect(result[0]?.pricesByModality?.online?.["1"]).toBe(45);
      expect(result[0]?.pricesByModality?.online?.["2"]).toBe(28);
      expect(result[0]?.pricesByModality?.offline?.["1"]).toBe(63);
      expect(result[0]?.prices).toEqual(result[0]?.pricesByModality?.online);
      expect(pricing.getEconomyConfig).toHaveBeenCalledTimes(1);
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

    test("projects economy prices for a profile loaded by id", async () => {
      const profile = makeProfile({
        modality: "both",
        baseRatesIdr: { online: 175_000, offline: 225_000 },
      });
      const repo = makeRepo({
        getProfileById: mock(async () => profile),
        listFutureAvailability: mock(async () => []),
      });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const service = createDiscoveryService({ repo, pricing });
      const result = await service.getProfile("tp1");

      expect(result.pricesByModality?.online).toBeDefined();
      expect(result.pricesByModality?.offline).toBeDefined();
    });

    test("lists subject category groups", async () => {
      const repo = makeRepo({
        listSubjects: mock(
          async () =>
            [
              {
                id: "cat-1",
                slug: "math",
                name: "Math",
                description: null,
                children: [],
              },
            ] as any,
        ),
      });
      const service = createDiscoveryService({ repo });

      await expect(service.listSubjects()).resolves.toEqual([
        {
          id: "cat-1",
          slug: "math",
          name: "Math",
          description: null,
          children: [],
        },
      ]);
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
