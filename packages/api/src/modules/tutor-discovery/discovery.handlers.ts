import type { Context } from "../../context";
import type { z } from "zod";
import type { listPublishedInput, getProfileInput } from "./discovery.types";

type ListPublishedInput = z.infer<typeof listPublishedInput>;
type GetProfileInput = z.infer<typeof getProfileInput>;

export const discoveryHandlers = {
  listPublished: async ({
    context,
    input,
  }: {
    context: Context;
    input: ListPublishedInput;
  }) => {
    return context.services.discovery.listPublished(input ?? {});
  },

  getProfile: async ({
    context,
    input,
  }: {
    context: Context;
    input: GetProfileInput;
  }) => {
    return context.services.discovery.getProfile(input.tutorId);
  },
};
