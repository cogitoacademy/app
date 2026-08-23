import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import type { WalletPort } from "../wallet/wallet.service";
import { mapContentError } from "./content.errors";
import type { ContentService } from "./content.service";

export function createContentHandler(deps: {
  service: ContentService;
  wallet: WalletPort;
}) {
  async function listCompetitions({ context: _context }: { context: Context }) {
    return withDomainMap(
      () => deps.service.listCompetitions(),
      mapContentError,
    );
  }

  async function listStudentResources({ context }: { context: Context }) {
    return withDomainMap(async () => {
      const access = await deps.wallet.knowledgeBankEligible(
        context.session!.user.id,
      );

      if (!access.eligible) {
        return { items: [], access };
      }

      return {
        items: await deps.service.listStudentResources(),
        access,
      };
    }, mapContentError);
  }

  return { listCompetitions, listStudentResources };
}

export type ContentHandler = ReturnType<typeof createContentHandler>;
