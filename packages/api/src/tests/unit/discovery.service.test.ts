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
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";

function makeProfile(
  overrides: Partial<ProfileWithUser> = {},
): ProfileWithUser {
  return {
    id: "tp1",
    shortBio: "Experienced tutor",
    affiliation: "Mathematics, Cogito Academy",
    experiences: [],
    modality: "online",
    onlineMaxClassSize: 6,
    offlineMaxClassSize: 6,
    prices: { "1": 50, "2": 40 },
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

function makeSubject(parentSlug: string) {
  return [
    {
      subjectId: "subject-1",
      subject: {
        id: "subject-1",
        slug: "specialization-one",
        name: "Specialization One",
        description: null,
        parentId: "parent-1",
        isActive: true,
        parent: {
          id: "parent-1",
          slug: parentSlug,
          name: parentSlug,
          description: null,
          parentId: null,
          isActive: true,
          lightTextColor: null,
          lightBackgroundColor: null,
          darkTextColor: null,
          darkBackgroundColor: null,
        },
      },
    },
  ] as any;
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
      expect(result.affiliation).toBe("Mathematics, Cogito Academy");
      expect(result.experiences).toEqual([]);
      expect(result.modality).toBe("online");
      expect(result.prices).toEqual({ "1": 50, "2": 40 });
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

    test("maps structured experiences to the public projection", () => {
      const experiences = [
        {
          role: "Mathematics Tutor",
          organization: "Cogito Academy",
          startYear: 2024,
          endYear: null,
          description: "Guided students through olympiad preparation.",
        },
      ];
      const result = buildProjection(makeProfile({ experiences }));
      expect(result.experiences).toEqual(experiences);
    });

    test("defaults optional projection fields without a legacy price snapshot", () => {
      const result = buildProjection(
        makeProfile({
          modality: "offline",
          prices: null,
          onlineMaxClassSize: null as never,
          offlineMaxClassSize: null as never,
          experiences: null as never,
        }),
      );

      expect(result.prices).toBeNull();
      expect(result.onlineMaxClassSize).toBe(6);
      expect(result.offlineMaxClassSize).toBe(6);
      expect(result.experiences).toEqual([]);
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

        categoryId: undefined,
        subjectId: undefined,
        categoryIds: undefined,
        subjectIds: undefined,
        modality: undefined,
        limit: 10,
        offset: 5,
      });
    });

    test("passes multiple category and specialization filters to the repo", async () => {
      const listPublished = mock(async () => []);
      const repo = makeRepo({ listPublished });
      const service = createDiscoveryService({ repo });

      await service.listPublished({
        categoryIds: ["category-1", "category-2"],
        subjectIds: ["subject-1", "subject-2"],
      });

      expect(listPublished).toHaveBeenCalledWith({
        search: undefined,

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

    test("uses offline prices as the fallback and preserves profiles without valid rates", async () => {
      const offlineProfile = makeProfile({
        id: "offline",
        modality: "offline",
        offlineMaxClassSize: null as never,
        baseRatesIdr: { offline: 225_000 },
      });
      const bothProfile = makeProfile({
        id: "both",
        modality: "both",
        onlineMaxClassSize: null as never,
        offlineMaxClassSize: null as never,
        baseRatesIdr: { online: null as never, offline: 225_000 },
      });
      const noRateProfile = makeProfile({
        id: "no-rate",
        modality: "online",
        baseRatesIdr: { online: null as never },
      });
      const repo = makeRepo({
        listPublished: mock(async () => [
          offlineProfile,
          bothProfile,
          noRateProfile,
        ]),
      });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const results = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(results[0]?.pricesByModality?.offline).toBeDefined();
      expect(results[0]?.prices).toEqual(results[0]?.pricesByModality?.offline);
      expect(results[1]?.pricesByModality?.online).toBeUndefined();
      expect(results[1]?.pricesByModality?.offline).toBeDefined();
      expect(results[1]?.prices).toEqual(results[1]?.pricesByModality?.offline);
      expect(results[2]?.pricesByModality).toEqual({});
      expect(results[2]?.prices).toEqual(noRateProfile.prices);
    });

    test("keeps an unpriced profile unchanged beside economy-priced profiles", async () => {
      const unpricedProfile = makeProfile({
        id: "unpriced",
        prices: null,
        baseRatesIdr: null as never,
      });
      const pricedProfile = makeProfile({
        id: "priced",
        baseRatesIdr: { online: 175_000 },
      });
      const repo = makeRepo({
        listPublished: mock(async () => [unpricedProfile, pricedProfile]),
      });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const results = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(results[0]?.prices).toBeNull();
      expect(results[0]?.pricesByModality).toBeNull();
      expect(results[1]?.pricesByModality?.online).toBeDefined();
    });

    test("only publishes prices up to each modality's class capacity", async () => {
      const profile = makeProfile({
        modality: "both",
        baseRatesIdr: { online: 175_000, offline: 225_000 },
        onlineMaxClassSize: 3,
        offlineMaxClassSize: 1,
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const [result] = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(Object.keys(result!.pricesByModality!.online!)).toEqual([
        "1",
        "2",
        "3",
      ]);
      expect(Object.keys(result!.pricesByModality!.offline!)).toEqual(["1"]);
    });

    test("uses active dynamic competition rates for selected catalog subjects", async () => {
      const config = structuredClone(DEFAULT_V3_ECONOMY_CONFIG);
      config.competitionRates["competition-policy-debate"] = {
        soloMarks: 41,
        soloFeeIdr: 123000,
      };
      const profile = makeProfile({
        subjects: makeSubject("competition-policy-debate"),
        baseRatesIdr: { online: 175_000, offline: 225_000 },
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getActiveV3Config: mock(async () => ({ version: 9, values: config })),
      };

      const [result] = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(result?.pricingRevision).toBe(9);
      expect(result?.prices).toBeNull();
      expect(result?.pricesByModality).toBeNull();
      expect(
        result?.pricesByCompetition?.["competition-policy-debate"]?.online,
      ).toMatchObject({ "1": 41, "2": 27 });
    });

    test("does not use legacy tutor rates for a dynamic subject without active V3", async () => {
      const profile = makeProfile({
        subjects: makeSubject("competition-policy-debate"),
        baseRatesIdr: { online: 175_000 },
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getActiveV3Config: mock(async () => null),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const [result] = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(result?.prices).toBeNull();
      expect(result?.pricesByModality).toBeNull();
      expect(result?.pricesByCompetition).toEqual({});
    });

    test("keeps the seven legacy parent prices while inactive V3 stays compatible", async () => {
      const profile = makeProfile({
        subjects: makeSubject("competition-debate"),
        baseRatesIdr: { online: 175_000 },
      });
      const repo = makeRepo({ listPublished: mock(async () => [profile]) });
      const pricing = {
        ...createPricingService(),
        getActiveV3Config: mock(async () => null),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };

      const [result] = await createDiscoveryService({
        repo,
        pricing,
      }).listPublished();

      expect(
        result?.pricesByCompetition?.["competition-debate"]?.online?.["1"],
      ).toBe(45);
      expect(result?.pricesByModality).toBeNull();
    });

    test("projects offline legacy prices and skips invalid modality rates", async () => {
      const offlineDefault = makeProfile({
        id: "offline-default",
        modality: "offline",
        offlineMaxClassSize: null as never,
        subjects: makeSubject("competition-debate"),
        baseRatesIdr: { offline: 225_000 },
      });
      const offlineLimited = makeProfile({
        id: "offline-limited",
        modality: "offline",
        offlineMaxClassSize: 2,
        subjects: makeSubject("competition-debate"),
        baseRatesIdr: { offline: 225_000 },
      });
      const bothWithInvalidOnlineRate = makeProfile({
        id: "both-invalid-online",
        modality: "both",
        onlineMaxClassSize: null as never,
        offlineMaxClassSize: 2,
        subjects: makeSubject("competition-debate"),
        baseRatesIdr: { online: null as never, offline: 225_000 },
      });
      const repo = makeRepo({
        listPublished: mock(async () => [
          offlineDefault,
          offlineLimited,
          bothWithInvalidOnlineRate,
        ]),
        getProfileById: mock(async () => offlineDefault),
      });
      const pricing = {
        ...createPricingService(),
        getActiveV3Config: mock(async () => null),
        getEconomyConfig: mock(async () => DEFAULT_ECONOMY_CONFIG),
      };
      const service = createDiscoveryService({ repo, pricing });

      const results = await service.listPublished();
      expect(
        Object.keys(
          results[0]?.pricesByCompetition?.["competition-debate"]?.offline ??
            {},
        ),
      ).toEqual(["1", "2", "3", "4", "5", "6"]);
      expect(
        Object.keys(
          results[1]?.pricesByCompetition?.["competition-debate"]?.offline ??
            {},
        ),
      ).toEqual(["1", "2"]);
      expect(
        results[2]?.pricesByCompetition?.["competition-debate"]?.online,
      ).toBeUndefined();
      expect(
        results[2]?.pricesByCompetition?.["competition-debate"]?.offline,
      ).toBeDefined();
      await expect(
        service.getProfile("offline-default"),
      ).resolves.toMatchObject({
        pricesByCompetition: {
          "competition-debate": { offline: expect.any(Object) },
        },
      });
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

    test("projects offline and missing-rate catalog entries from active V3 pricing", async () => {
      const config = structuredClone(DEFAULT_V3_ECONOMY_CONFIG);
      config.competitionRates["competition-policy-debate"] = {
        soloMarks: 41,
        soloFeeIdr: 123_000,
      };
      const offlineLimited = makeProfile({
        id: "offline-limited",
        modality: "offline",
        offlineMaxClassSize: 2,
        subjects: makeSubject("competition-policy-debate"),
      });
      const offlineDefault = makeProfile({
        id: "offline-default",
        modality: "offline",
        offlineMaxClassSize: null as never,
        subjects: makeSubject("competition-policy-debate"),
      });
      const onlineDefault = makeProfile({
        id: "online-default",
        modality: "online",
        onlineMaxClassSize: null as never,
        subjects: makeSubject("competition-policy-debate"),
      });
      const noConfiguredRate = makeProfile({
        id: "no-configured-rate",
        modality: "online",
        subjects: makeSubject("competition-not-configured"),
      });
      const repo = makeRepo({
        listPublished: mock(async () => [
          offlineLimited,
          offlineDefault,
          onlineDefault,
          noConfiguredRate,
        ]),
        getProfileById: mock(async () => offlineLimited),
      });
      const pricing = {
        ...createPricingService(),
        getActiveV3Config: mock(async () => ({ version: 9, values: config })),
      };
      const service = createDiscoveryService({ repo, pricing });

      const results = await service.listPublished();
      expect(
        Object.keys(
          results[0]?.pricesByCompetition?.["competition-policy-debate"]
            ?.offline ?? {},
        ),
      ).toEqual(["1", "2"]);
      expect(
        Object.keys(
          results[1]?.pricesByCompetition?.["competition-policy-debate"]
            ?.offline ?? {},
        ),
      ).toEqual(["1", "2", "3", "4", "5", "6"]);
      expect(
        Object.keys(
          results[2]?.pricesByCompetition?.["competition-policy-debate"]
            ?.online ?? {},
        ),
      ).toEqual(["1", "2", "3", "4", "5", "6"]);
      expect(results[3]?.pricesByCompetition).toEqual({});
      await expect(
        service.getProfile("offline-limited"),
      ).resolves.toMatchObject({ pricingRevision: 9 });
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
          parentColors: null,
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
