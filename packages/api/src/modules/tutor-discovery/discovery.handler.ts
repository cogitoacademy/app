import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";
import { buildProjection } from "./discovery.service";
import type { DiscoveryRepo, ListPublishedInput } from "./discovery.repo";

export function createDiscoveryHandler(deps: {
  discoveryRepo: DiscoveryRepo;
  db: DbType;
}) {
  const { discoveryRepo, db } = deps;

  async function listPublished(input: ListPublishedInput = {}) {
    const profiles = await discoveryRepo.listPublished(db, input);
    return profiles.map((p) => buildProjection(p));
  }

  async function getProfile(tutorId: string) {
    const profile = await discoveryRepo.getProfileById(db, tutorId);
    if (!profile) throw notFound("Tutor profile not found");
    return buildProjection(profile);
  }

  return { listPublished, getProfile };
}

export type DiscoveryHandler = ReturnType<typeof createDiscoveryHandler>;
