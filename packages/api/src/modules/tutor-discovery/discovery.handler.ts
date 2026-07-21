import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { notFound, internalServerError } from "../../lib/errors";
import { buildProjection } from "./discovery.service";
import type { DiscoveryRepo, ListPublishedInput } from "./discovery.repo";
import type { DbType } from "../../lib/db";
import { getProfileInput } from "./discovery.types";

type GetProfileInput = z.infer<typeof getProfileInput>;

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
      try {
        const profiles = await discoveryRepo.listPublished(db, input ?? {});
        return profiles.map((p) => buildProjection(p));
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list published profiles", err);
      }
    },

    getProfile: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetProfileInput;
    }) => {
      try {
        const profile = await discoveryRepo.getProfileById(db, input.tutorId);
        if (!profile) throw notFound("Tutor profile not found");
        return buildProjection(profile);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch tutor profile", err);
      }
    },
  };
}
