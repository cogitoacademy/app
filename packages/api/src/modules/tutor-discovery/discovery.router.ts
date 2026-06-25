import { protectedProcedure } from "../../procedures";
import { listPublishedInput } from "./discovery.types";

export const discoveryRouter = {
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
    .handler(async ({ context, input }) => {
      return context.services.discovery.listPublished(input ?? {});
    }),
};
