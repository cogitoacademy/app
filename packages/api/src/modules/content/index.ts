import type { ContentAdminRepo } from "../content-admin/content-admin.repo";
import type { PrivateKbStorage } from "../../lib/private-kb-storage";
import type { SanityClient } from "@sanity/client";

import type { WalletPort } from "../wallet/wallet.service";
import type { CompetitionPaletteResolver } from "../competition-catalog";
import { createContentHandler } from "./content.handler";
import type { ContentHandler } from "./content.handler";
import { createContentService } from "./content.service";
import type { ContentService } from "./content.service";

export type ContentModule = ReturnType<typeof createContentModule>;

export function createContentModule(deps: {
  wallet: WalletPort;
  competitionPalette: CompetitionPaletteResolver;
  client?: SanityClient;
  database?: ContentAdminRepo;
  privateStorage?: () => PrivateKbStorage;
  kbSource?: "sanity" | "database";
  ccSource?: "sanity" | "database";
}) {
  const service = createContentService({
    ...deps,
    competitionPalette: deps.competitionPalette,
  });
  const handler = createContentHandler({
    service,
    wallet: deps.wallet,
  });

  return { service, handler };
}

export type { ContentHandler, ContentService };
export type {
  CompetitionContent,
  ContentAccess,
  StudentResourceContent,
  StudentResourceFile,
} from "./content.types";
