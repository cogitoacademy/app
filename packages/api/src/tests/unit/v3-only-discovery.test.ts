import { describe, expect, mock, test } from "bun:test";
import {
  createDiscoveryService,
  type ProfileWithUser,
} from "../../modules/tutor-discovery/discovery.service";
import type { DiscoveryRepo } from "../../modules/tutor-discovery/discovery.repo";
import { createPricingService } from "../../modules/pricing/pricing.service";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";

describe("V3-only discovery", () => {
  const profile = {
    id: "profile",
    userId: "tutor",
    user: { name: "Tutor" },
    modality: "online",
    prices: { "1": 999 },
    baseRatesIdr: { online: 999999 },
    subjects: [
      {
        subjectId: "subject",
        subject: {
          id: "subject",
          parentId: "debate",
          slug: "law",
          name: "Law Debate",
          isActive: true,
          parent: {
            id: "debate",
            parentId: null,
            slug: "competition-debate",
            name: "Debate",
            isActive: true,
          },
        },
      },
    ],
  } as unknown as ProfileWithUser;

  test("missing active revision never exposes old tutor prices", async () => {
    const legacyPricing = mock(() => {
      throw new Error("Legacy pricing was called");
    });
    const pricing = {
      ...createPricingService(),
      getActiveV3Config: async () => null,
      computeEconomics: legacyPricing,
      getEconomyConfig: legacyPricing,
    };
    const repo = {
      listPublished: async () => [profile],
    } as unknown as DiscoveryRepo;
    const service = createDiscoveryService({ repo, pricing });
    const result = await service.listPublished();
    expect(result[0]?.prices).toBeNull();
    expect(result[0]?.pricesByCompetition).toBeNull();
    expect(legacyPricing).not.toHaveBeenCalled();
  });

  test("assigned specialization inherits the active parent rate", async () => {
    const pricing = {
      ...createPricingService(),
      getActiveV3Config: async () => ({
        version: 1,
        values: DEFAULT_V3_ECONOMY_CONFIG,
      }),
    };
    const repo = {
      listPublished: async () => [profile],
    } as unknown as DiscoveryRepo;
    const service = createDiscoveryService({ repo, pricing });
    const result = await service.listPublished();
    expect(
      result[0]?.pricesByCompetition?.["competition-debate"]?.online?.["1"],
    ).toBe(44);
    expect(result[0]?.pricingRevision).toBe(1);
    expect(result[0]?.prices).toBeNull();
  });
});
