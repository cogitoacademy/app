import type { tutorProfile, user } from "@cogito-app/db/schema";
import type { DiscoveryRepo, ListPublishedInput } from "./discovery.repo";
import { TutorProfileNotFoundError } from "./discovery.errors";

type TutorProfileRow = typeof tutorProfile.$inferSelect;
type UserRow = typeof user.$inferSelect;

export interface ProfileWithUser extends TutorProfileRow {
  user: UserRow | null;
}

export interface ProfileProjection {
  id: string;
  userId: string;
  displayName: string | null;
  shortBio: string | null;
  credentialsSummary: string | null;
  expertise: string[];
  modality: string | null;
  prices: unknown;
  availabilitySummary: string | null;
  proofUrls: unknown;
  publishedAt: Date | null;
  user: { name: string | null; image: string | null } | null;
}

export function buildProjection(profile: ProfileWithUser): ProfileProjection {
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    shortBio: profile.shortBio,
    credentialsSummary: profile.credentialsSummary,
    expertise: profile.expertise ?? [],
    modality: profile.modality,
    prices: profile.prices,
    availabilitySummary: profile.availabilitySummary,
    proofUrls: profile.proofUrls,
    publishedAt: profile.publishedAt,
    user: profile.user
      ? { name: profile.user.name, image: profile.user.image }
      : null,
  };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;

export function createDiscoveryService(deps: { repo: DiscoveryRepo }) {
  const { repo } = deps;

  async function listPublished(opts: ListPublishedInput = {}) {
    const profiles = await repo.listPublished(opts);
    return profiles.map(buildProjection);
  }

  async function getProfile(tutorId: string) {
    const profile = await repo.getProfileById(tutorId);
    if (!profile) throw new TutorProfileNotFoundError(tutorId);
    return buildProjection(profile);
  }

  return { listPublished, getProfile };
}
