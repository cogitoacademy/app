import type { Context } from "../../context";
import type { PublicContentService } from "./public-content.service";
import type {
  listPublicCalendarInput,
  listPublicTutorsInput,
} from "./public-content.types";
import type { z } from "zod";

type ListPublicTutorsInput = z.infer<typeof listPublicTutorsInput>;
type ListPublicCalendarInput = z.infer<typeof listPublicCalendarInput>;

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
    listCalendar: async ({
      context: _context,
      input: _input,
    }: {
      context: Context;
      input: ListPublicCalendarInput;
    }) => service.listCalendar(),
  };
}

export type PublicContentHandler = ReturnType<
  typeof createPublicContentHandler
>;
