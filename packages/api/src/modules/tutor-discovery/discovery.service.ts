import type { tutorProfile, user } from "@cogito-app/db/schema";
import type { DiscoveryRepo } from "./discovery.repo";
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
  prices: Record<string, number> | null;
  availabilitySummary: string | null;
  proofUrls: string[] | null;
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

  async function listPublished(opts?: {
    search?: string;
    expertise?: string;
    modality?: "online" | "offline" | "both";
    limit?: number;
    offset?: number;
  }) {
    const profiles = await repo.listPublished({
      search: opts?.search,
      expertise: opts?.expertise,
      modality: opts?.modality,
      limit: opts?.limit ?? 20,
      offset: opts?.offset ?? 0,
    });
    return profiles.map(buildProjection);
  }

  async function getProfile(tutorId: string) {
    const profile = await repo.getProfileById(tutorId);
    if (!profile) throw new TutorProfileNotFoundError(tutorId);
    const availabilitySlots = await repo.listFutureAvailability(profile.userId);
    return { ...buildProjection(profile), availabilitySlots };
  }

  return { listPublished, getProfile };
}
