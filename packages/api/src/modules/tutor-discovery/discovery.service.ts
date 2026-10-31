import type { tutorProfile, user } from "@cogito-app/db/schema";
import type { DiscoveryRepo } from "./discovery.repo";
import { TutorProfileNotFoundError } from "./discovery.errors";
import type { GroupSize, PricingPort } from "../pricing/pricing.service";
import type { V3ConfigRevision } from "../pricing/pricing.service";
import {
  toNormalizedTutorSubjects,
  toSubjectCategoryGroup,
  type NormalizedTutorSubject,
  type TutorSubjectRelation,
} from "../tutor-subjects/subject-selection";

type TutorProfileRow = typeof tutorProfile.$inferSelect;
type UserRow = typeof user.$inferSelect;
type PublicTutorUser = Pick<UserRow, "id" | "name" | "image" | "role">;
type SupportedModality = "online" | "offline";
type PricesByModality = Partial<
  Record<SupportedModality, Record<string, number>>
>;
type PricesByCompetition = Record<string, PricesByModality>;

export interface ProfileWithUser extends Omit<
  TutorProfileRow,
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountHolderName"
  | "bankAccountOpeningCity"
  | "bankAccountOwnership"
  | "bankTransferDisclaimerAccepted"
  | "termsOfServiceAcceptedAt"
  | "termsOfServiceVersion"
> {
  user: PublicTutorUser | null;
  subjects?: Array<TutorSubjectRelation & { subjectId: string }>;
}

export interface ProfileProjection {
  id: string;
  userId: string;
  displayName: string | null;
  shortBio: string | null;
  affiliation: string | null;
  education: TutorProfileRow["education"];
  achievements: TutorProfileRow["achievements"];
  experiences: TutorProfileRow["experiences"];
  subjects: NormalizedTutorSubject[];
  modality: string | null;
  onlineMaxClassSize: number;
  offlineMaxClassSize: number;
  prices: Record<string, number> | null;
  pricesByModality: PricesByModality | null;
  pricesByCompetition: PricesByCompetition | null;
  pricingRevision: number | null;
  publishedAt: Date | null;
  user: { name: string | null; image: string | null } | null;
}

export function buildProjection(profile: ProfileWithUser): ProfileProjection {
  const onlineMaxClassSize = profile.onlineMaxClassSize ?? 6;
  const offlineMaxClassSize = profile.offlineMaxClassSize ?? 6;
  return {
    id: profile.id,
    userId: profile.userId,
    // Keep the response key for backward compatibility, but source every
    // role's visible name from the canonical auth user record.
    displayName: profile.user?.name ?? null,
    shortBio: profile.shortBio,
    affiliation: profile.affiliation,
    education: profile.education ?? [],
    achievements: profile.achievements ?? [],
    experiences: profile.experiences ?? [],
    subjects: toNormalizedTutorSubjects(profile.subjects),
    modality: profile.modality,
    onlineMaxClassSize,
    offlineMaxClassSize,
    prices: null,
    pricesByModality: null,
    pricesByCompetition: null,
    pricingRevision: null,
    publishedAt: profile.publishedAt,
    user: profile.user
      ? { name: profile.user.name, image: profile.user.image }
      : null,
  };
}

function getSupportedModalities(modality: string | null): SupportedModality[] {
  if (modality === "offline") return ["offline"];
  if (modality === "both") return ["online", "offline"];
  return ["online"];
}

function buildV3CompetitionPrices(
  profile: ProfileWithUser,
  projection: ProfileProjection,
  pricing: PricingPort,
  active: V3ConfigRevision,
): ProfileProjection {
  const pricesByCompetition: PricesByCompetition = {};
  for (const subject of projection.subjects) {
    const slug = subject.parent.slug;
    if (
      !subject.isSelectable ||
      !Object.hasOwn(active.values.competitionRates, slug)
    )
      continue;
    const pricesByModality: PricesByModality = {};
    for (const modality of getSupportedModalities(profile.modality)) {
      const maxClassSize =
        modality === "offline"
          ? (profile.offlineMaxClassSize ?? 6)
          : (profile.onlineMaxClassSize ?? 6);
      const prices: Record<string, number> = {};
      for (const size of [1, 2, 3, 4, 5, 6] as GroupSize[]) {
        if (size > maxClassSize) break;
        prices[String(size)] = pricing.calculateV3SessionPrice(
          { competition: slug, modality, headcount: size },
          active.values,
        ).perStudentMarks;
      }
      pricesByModality[modality] = prices;
    }
    pricesByCompetition[slug] = pricesByModality;
  }

  return {
    ...projection,
    prices: null,
    pricesByModality: null,
    pricesByCompetition,
    pricingRevision: active.version,
  };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;

export function createDiscoveryService(deps: {
  repo: DiscoveryRepo;
  pricing?: PricingPort;
}) {
  const { repo, pricing } = deps;

  async function projectProfiles(profiles: ProfileWithUser[]) {
    const projections = profiles.map(buildProjection);
    if (!pricing) return projections;
    const active = await pricing.getActiveV3Config();
    if (active) {
      return profiles.map((profile, index) =>
        buildV3CompetitionPrices(profile, projections[index]!, pricing, active),
      );
    }
    return projections;
  }

  async function projectProfile(profile: ProfileWithUser) {
    const projection = buildProjection(profile);
    if (!pricing) return projection;
    const active = await pricing.getActiveV3Config();
    return active
      ? buildV3CompetitionPrices(profile, projection, pricing, active)
      : projection;
  }

  async function listPublished(opts?: {
    search?: string;
    categoryId?: string;
    subjectId?: string;
    categoryIds?: string[];
    subjectIds?: string[];
    modality?: "online" | "offline" | "both";
    limit?: number;
    offset?: number;
  }) {
    const profiles = await repo.listPublished({
      search: opts?.search,
      categoryId: opts?.categoryId,
      subjectId: opts?.subjectId,
      categoryIds: opts?.categoryIds,
      subjectIds: opts?.subjectIds,
      modality: opts?.modality,
      limit: opts?.limit ?? 20,
      offset: opts?.offset ?? 0,
    });
    return projectProfiles(profiles);
  }

  async function listSubjects() {
    const categories = await repo.listSubjects();
    return categories.map(toSubjectCategoryGroup);
  }

  async function getProfile(tutorId: string) {
    const profile = await repo.getProfileById(tutorId);
    if (!profile) throw new TutorProfileNotFoundError(tutorId);
    const availabilitySlots = await repo.listFutureAvailability(profile.userId);
    return { ...(await projectProfile(profile)), availabilitySlots };
  }

  return { listPublished, listSubjects, getProfile };
}
