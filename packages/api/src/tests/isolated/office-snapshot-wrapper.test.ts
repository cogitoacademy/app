import { afterAll, describe, expect, mock, test } from "bun:test";
import { snapshotFixture } from "../helpers/office-snapshot-fixture";

// This file runs in its own process: module replacements cannot leak into DB suites.
const fixture = snapshotFixture(false);
const configuration = {
  PAYMENT_PROVIDER: "midtrans",
  MIDTRANS_MODE: "live",
  CC_SOURCE: "db",
  KB_SOURCE: "db",
};
const competition = {
  id: "public-event",
  title: "Public event",
  categories: [{ id: "debate" }],
  startDate: new Date().toISOString(),
  endDate: new Date().toISOString(),
  scale: "national",
  registrationDeadline: null,
  location: "Jakarta",
  organizer: "Public organizer",
  educationLevels: ["sma"],
  registrationLink: "https://example.test/register",
  socialMediaLink: null,
};
const content = {
  listCompetitions: mock(async () => [
    competition,
    {
      ...competition,
      id: "too-late",
      startDate: "2099-01-01",
      endDate: "2099-01-02",
    },
    {
      ...competition,
      id: "too-old",
      startDate: "2000-01-01",
      endDate: "2000-01-02",
    },
  ]),
  listStudentResources: mock(async () => [
    {
      id: "resource",
      title: "Public resource",
      category: "debate",
      privateToken: "secret",
    },
  ]),
};
mock.module("../../lib/db", () => ({ db: fixture.db }));
mock.module("../../services", () => ({
  services: {
    admin: fixture.admin,
    referral: fixture.referral,
    pricing: { getActiveV3Config: async () => null },
    content,
  },
}));
mock.module("@cogito-app/env/server", () => ({ env: configuration }));
mock.module("../../modules/office/office-signup-sources", () => ({
  getOfficeSignupSources: async () => [],
}));
const { getOfficeSnapshot } =
  await import("../../modules/office/office-snapshot");
afterAll(() => mock.restore());

describe("Office snapshot configured source adapter", () => {
  test("uses database content and live Midtrans mode", async () => {
    const result = await getOfficeSnapshot();
    expect(result.system.paymentMode).toBe("live");
    expect(result.calendar).toEqual([]);
    expect(result.content.knowledgeBank).toEqual([]);
    expect(content.listCompetitions).not.toHaveBeenCalled();
    expect(content.listStudentResources).not.toHaveBeenCalled();
  });
  test("projects Sanity public content and bounds competition dates", async () => {
    configuration.CC_SOURCE = "sanity";
    configuration.KB_SOURCE = "sanity";
    configuration.MIDTRANS_MODE = "sandbox";
    const result = await getOfficeSnapshot();
    expect(result.system.paymentMode).toBe("sandbox");
    expect(result.calendar).toHaveLength(1);
    expect(result.calendar[0]).toMatchObject({
      id: "public-event",
      categories: ["debate"],
      status: "published",
    });
    expect(result.content.knowledgeBank).toEqual([
      {
        id: "resource",
        title: "Public resource",
        category: "debate",
        status: "published",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("privateToken");
  });
  test("reports unavailable payment mode for a different provider", async () => {
    configuration.PAYMENT_PROVIDER = "stub";
    expect((await getOfficeSnapshot()).system.paymentMode).toBeNull();
  });
});
