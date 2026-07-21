import { protectedProcedure } from "../../procedures";
import { listPublishedInput, getProfileInput } from "./discovery.types";
import type { DiscoveryHandler } from "./discovery.handler";

export function createDiscoveryRouter(handler: DiscoveryHandler) {
  return {
    listPublished: protectedProcedure
      .route({
        method: "POST",
        path: "/tutors/list",
        tags: ["Tutors"],
        summary: "List published tutors",
        description:
          "Returns published tutor profiles with optional search and filters (SQL-level)",
      })
      .input(listPublishedInput)
      .handler(handler.listPublished),

    getProfile: protectedProcedure
      .route({
        method: "POST",
        path: "/tutors/profile/get",
        tags: ["Tutors"],
        summary: "Get published tutor profile",
        description:
          "Returns a published tutor profile with availability slots",
      })
      .input(getProfileInput)
      .handler(handler.getProfile),
  };
}
