import type { Context } from "../../context";
import type { PublicContentService } from "./public-content.service";
import type { listPublicTutorsInput } from "./public-content.types";
import type { z } from "zod";

type ListPublicTutorsInput = z.infer<typeof listPublicTutorsInput>;

export function createPublicContentHandler(deps: {
  service: PublicContentService;
}) {
  const { service } = deps;

  return {
    listTutors: async ({
      context: _context,
      input: _input,
    }: {
      context: Context;
      input: ListPublicTutorsInput;
    }) => service.listTutors(),
  };
}

export type PublicContentHandler = ReturnType<
  typeof createPublicContentHandler
>;
