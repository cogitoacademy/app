import { publicProcedure } from "../../procedures";
import type { PublicContentHandler } from "./public-content.handler";
import { listPublicTutorsInput } from "./public-content.types";

export function createPublicContentRouter(handler: PublicContentHandler) {
  return {
    tutors: {
      list: publicProcedure
        .route({
          method: "POST",
          path: "/public-content/tutors/list",
          tags: ["Public content"],
          summary: "List public tutors",
          description:
            "Returns only published tutors using a strict public profile projection",
        })
        .input(listPublicTutorsInput)
        .handler(handler.listTutors),
    },
  };
}
