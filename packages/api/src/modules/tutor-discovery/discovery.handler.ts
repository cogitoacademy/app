import type { Context } from "../../context";
import { notFound } from "../../lib/errors";
import { buildProjection } from "./discovery.service";
import type { DiscoveryRepo, ListPublishedInput } from "./discovery.repo";
import type { DbType } from "../../lib/db";

export type DiscoveryHandler = ReturnType<typeof createDiscoveryHandler>;

export function createDiscoveryHandler(deps: {
  discoveryRepo: DiscoveryRepo;
  db: DbType;
}) {
  const { discoveryRepo, db } = deps;

  return {
    listPublished: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListPublishedInput | undefined;
    }) => {
      const profiles = await discoveryRepo.listPublished(db, input ?? {});
      return profiles.map((p) => buildProjection(p));
    },

    getProfile: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: any;
    }) => {
      const profile = await discoveryRepo.getProfileById(db, input.tutorId);
      if (!profile) throw notFound("Tutor profile not found");
      return buildProjection(profile);
    },
  };
}
