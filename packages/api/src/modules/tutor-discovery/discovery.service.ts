import type { tutorProfile, user } from "@cogito-app/db/schema";

type TutorProfileRow = typeof tutorProfile.$inferSelect;
type UserRow = typeof user.$inferSelect;

export interface ProfileWithUser extends TutorProfileRow {
  user: UserRow | null;
}

export function buildProjection(profile: ProfileWithUser) {
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
