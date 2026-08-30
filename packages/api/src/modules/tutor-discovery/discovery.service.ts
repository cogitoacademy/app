import type { tutorProfile, user } from "@cogito-app/db/schema";
import type { DiscoveryRepo } from "./discovery.repo";
import { TutorProfileNotFoundError } from "./discovery.errors";
import type { EconomyParameters } from "../economy";
import type { GroupSize, PricingPort } from "../pricing/pricing.service";
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

export interface ProfileWithUser extends Omit<
  TutorProfileRow,
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountHolderName"
  | "bankAccountOpeningCity"
  | "bankAccountOwnership"
  | "bankTransferDisclaimerAccepted"
> {
  user: PublicTutorUser | null;
  subjects?: Array<TutorSubjectRelation & { subjectId: string }>;
}

export interface ProfileProjection {
  id: string;
  userId: string;
  displayName: string | null;
  shortBio: string | null;
  credentialsSummary: string | null;
  achievements: string | null;
  experiences: string | null;
  expertise: string[];
  subjects: NormalizedTutorSubject[];
  modality: string | null;
  prices: Record<string, number> | null;
  pricesByModality: PricesByModality | null;
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
    achievements: profile.achievements,
    experiences: profile.experiences,
    expertise: profile.expertise ?? [],
    subjects: toNormalizedTutorSubjects(profile.subjects),
    modality: profile.modality,
    prices: profile.prices,
    pricesByModality: null,
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

function buildEconomyPrices(
  profile: ProfileWithUser,
  projection: ProfileProjection,
  pricing: PricingPort,
  config: EconomyParameters,
): ProfileProjection {
  if (!profile.baseRatesIdr) return projection;

  const pricesByModality: PricesByModality = {};
  for (const modality of getSupportedModalities(profile.modality)) {
    const baseRateIdr = profile.baseRatesIdr[modality];
    if (typeof baseRateIdr !== "number") continue;

    const prices: Record<string, number> = {};
    for (const size of [1, 2, 3, 4, 5, 6] as GroupSize[]) {
      prices[String(size)] = pricing.computeEconomics(
        modality,
        baseRateIdr,
        size,
        config,
      ).perStudent;
    }
    pricesByModality[modality] = prices;
  }

  const preferredModality =
    profile.modality === "offline" ? "offline" : "online";
  const preferredPrices =
    pricesByModality[preferredModality] ?? Object.values(pricesByModality)[0];

  return {
    ...projection,
    prices: preferredPrices ?? projection.prices,
    pricesByModality,
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
    if (!pricing || !profiles.some((profile) => profile.baseRatesIdr)) {
      return projections;
    }

    const config = await pricing.getEconomyConfig();
    return profiles.map((profile, index) =>
      buildEconomyPrices(profile, projections[index]!, pricing, config),
    );
  }

  async function projectProfile(profile: ProfileWithUser) {
    const projection = buildProjection(profile);
    if (!pricing || !profile.baseRatesIdr) return projection;
    return buildEconomyPrices(
      profile,
      projection,
      pricing,
      await pricing.getEconomyConfig(),
    );
  }

  async function listPublished(opts?: {
    search?: string;
    expertise?: string;
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
      expertise: opts?.expertise,
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
