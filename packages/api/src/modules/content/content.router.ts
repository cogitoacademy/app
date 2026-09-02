import { protectedProcedure } from "../../procedures";
import type { ContentHandler } from "./content.handler";

export function createContentRouter(handler: ContentHandler) {
  return {
    listCompetitions: protectedProcedure
      .route({
        method: "POST",
        path: "/content/competitions/list",
        tags: ["Content"],
        summary: "List competition calendar events",
        description:
          "Returns the published, English competition calendar for authenticated users",
      })
      .handler(handler.listCompetitions),

    listStudentResources: protectedProcedure
      .route({
        method: "POST",
        path: "/content/knowledge-bank/list",
        tags: ["Content"],
        summary: "List Knowledge Bank resources",
        description:
          "Returns published Knowledge Bank resources for students meeting the 35-Mark threshold and for authenticated tutors or admins",
      })
      .handler(handler.listStudentResources),
  };
}
