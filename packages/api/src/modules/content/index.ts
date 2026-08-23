import type { SanityClient } from "@sanity/client";

import type { WalletPort } from "../wallet/wallet.service";
import { createContentHandler } from "./content.handler";
import type { ContentHandler } from "./content.handler";
import { createContentService } from "./content.service";
import type { ContentService } from "./content.service";

export type ContentModule = ReturnType<typeof createContentModule>;

export function createContentModule(deps: {
  wallet: WalletPort;
  client?: SanityClient;
}) {
  const service = createContentService({ client: deps.client });
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
