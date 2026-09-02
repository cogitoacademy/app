import { describe, expect, mock, test } from "bun:test";

import { createContentHandler } from "../../modules/content/content.handler";
import type { ContentService } from "../../modules/content/content.service";
import type { WalletPort } from "../../modules/wallet/wallet.service";
import { DomainError } from "../../lib/domain-errors";

class ContentTestError extends DomainError {
  readonly domain = "content";
}

function makeContentService(overrides: Partial<ContentService> = {}) {
  return {
    listCompetitions: mock(async () => []),
    listStudentResources: mock(async () => []),
    getStudentResourceFile: mock(async () => null),
    ...overrides,
  } as ContentService;
}

function makeWallet(access: {
  eligible: boolean;
  balance: number;
  threshold: number;
}): WalletPort {
  return {
    knowledgeBankEligible: mock(async () => access),
  } as unknown as WalletPort;
}

describe("content handlers", () => {
  test("lists published competitions for an authenticated user", async () => {
    const competitions = [
      {
        id: "competition-1",
        title: "English Competition",
        description: null,
        location: null,
        categories: [],
        educationLevels: [],
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-09-02T00:00:00.000Z",
        scale: "national",
        organizer: null,
        registrationDeadline: null,
        registrationLink: null,
        socialMediaLink: null,
      },
    ];
    const listCompetitions = mock(async () => competitions);
    const handler = createContentHandler({
      service: makeContentService({ listCompetitions }),
      wallet: makeWallet({ eligible: false, balance: 0, threshold: 35 }),
    });

    const result = await handler.listCompetitions({ context: {} as any });

    expect(listCompetitions).toHaveBeenCalledTimes(1);
    expect(result).toEqual(competitions);
  });

  test("maps content domain errors to an internal API error", async () => {
    const handler = createContentHandler({
      service: makeContentService({
        listCompetitions: mock(async () => {
          throw new ContentTestError("CONTENT_TEST", "Sanity failed");
        }),
      }),
      wallet: makeWallet({ eligible: false, balance: 0, threshold: 35 }),
    });

    await expect(
      handler.listCompetitions({ context: {} as any }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sanity failed",
    });
  });

  test("does not read Knowledge Bank content below the Marks threshold", async () => {
    const listStudentResources = mock(async () => [
      {
        id: "resource-1",
        title: "Should stay private",
        description: null,
        category: "academic",
      },
    ]);
    const handler = createContentHandler({
      service: makeContentService({ listStudentResources }),
      wallet: makeWallet({ eligible: false, balance: 34, threshold: 35 }),
    });

    const result = await handler.listStudentResources({
      context: {
        session: { user: { id: "student-1", role: "student" } },
      } as any,
    });

    expect(listStudentResources).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [],
      access: { eligible: false, balance: 34, threshold: 35 },
    });
  });

  test("lists Knowledge Bank content for an eligible student", async () => {
    const resources = [
      {
        id: "resource-1",
        title: "Research guide",
        description: "A guide",
        category: "academic",
      },
    ];
    const listStudentResources = mock(async () => resources);
    const handler = createContentHandler({
      service: makeContentService({ listStudentResources }),
      wallet: makeWallet({ eligible: true, balance: 40, threshold: 35 }),
    });

    const result = await handler.listStudentResources({
      context: {
        session: { user: { id: "student-1", role: "student" } },
      } as any,
    });

    expect(listStudentResources).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: resources,
      access: { eligible: true, balance: 40, threshold: 35 },
    });
  });

  test("lists Knowledge Bank content for a tutor without a Marks balance", async () => {
    const resources = [
      {
        id: "resource-1",
        title: "Tutor reference",
        description: "A teaching guide",
        category: "academic",
      },
    ];
    const listStudentResources = mock(async () => resources);
    const knowledgeBankEligible = mock(async () => ({
      eligible: true,
      balance: 0,
      threshold: 35,
    }));
    const handler = createContentHandler({
      service: makeContentService({ listStudentResources }),
      wallet: {
        knowledgeBankEligible,
      } as unknown as WalletPort,
    });

    const result = await handler.listStudentResources({
      context: {
        session: { user: { id: "tutor-1", role: "tutor" } },
      } as any,
    });

    expect(knowledgeBankEligible).toHaveBeenCalledWith("tutor-1", "tutor");
    expect(listStudentResources).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: resources,
      access: { eligible: true, balance: 0, threshold: 35 },
    });
  });

  test("lists Knowledge Bank content for an admin without a Marks balance", async () => {
    const resources = [
      {
        id: "resource-1",
        title: "Admin reference",
        description: "An operations guide",
        category: "general",
      },
    ];
    const listStudentResources = mock(async () => resources);
    const knowledgeBankEligible = mock(async () => ({
      eligible: true,
      balance: 0,
      threshold: 35,
    }));
    const handler = createContentHandler({
      service: makeContentService({ listStudentResources }),
      wallet: {
        knowledgeBankEligible,
      } as unknown as WalletPort,
    });

    const result = await handler.listStudentResources({
      context: {
        session: { user: { id: "admin-1", role: "admin" } },
      } as any,
    });

    expect(knowledgeBankEligible).toHaveBeenCalledWith("admin-1", "admin");
    expect(listStudentResources).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: resources,
      access: { eligible: true, balance: 0, threshold: 35 },
    });
  });
});
