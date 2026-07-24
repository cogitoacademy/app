import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapDiscoveryError } from "./discovery.errors";
import type { DiscoveryService } from "./discovery.service";
import { getProfileInput } from "./discovery.types";

type GetProfileInput = z.infer<typeof getProfileInput>;

export type DiscoveryHandler = ReturnType<typeof createDiscoveryHandler>;

export function createDiscoveryHandler(deps: { service: DiscoveryService }) {
  const { service } = deps;

  return {
    listPublished: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListPublishedInput | undefined;
    }) => {
      return withDomainMap(
        () => service.listPublished(input ?? {}),
        mapDiscoveryError,
      );
    },

    getProfile: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetProfileInput;
    }) => {
      return withDomainMap(
        () => service.getProfile(input.tutorId),
        mapDiscoveryError,
      );
    },
  };
}

type ListPublishedInput = Parameters<DiscoveryService["listPublished"]>[0];
