import { describe, test, expect } from "bun:test";
import {
  buildProjection,
  type ProfileWithUser,
} from "../../modules/tutor-discovery/discovery.service";

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

describe("Discovery Service", () => {
  describe("buildProjection", () => {
    test("maps profile fields to public projection", () => {
      const profile = makeProfile();
      const result = buildProjection(profile);
      expect(result.id).toBe("tp1");
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
});
