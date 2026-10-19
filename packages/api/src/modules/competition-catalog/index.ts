import type { DbType } from "../../lib/db";
import type { AuditPort } from "../audit/audit.service";
import type { EconomyService } from "../economy/economy.service";
import { createCompetitionCatalogHandler } from "./competition-catalog.handler";
import { createCompetitionCatalogService } from "./competition-catalog.service";

export function createCompetitionCatalogModule(deps: {
  db: DbType;
  audit: AuditPort;
  economy: EconomyService;
}) {
  const service = createCompetitionCatalogService(deps);
  const handler = createCompetitionCatalogHandler(service);
  return { service, handler };
}

export type { CompetitionCatalogService } from "./competition-catalog.service";
export type { CompetitionPaletteResolver } from "./competition-catalog.service";
export type { CompetitionCatalogHandler } from "./competition-catalog.handler";
export type {
  CompetitionPalette,
  CompetitionPaletteReference,
} from "./competition-catalog.types";
export {
  isSelectableCompetitionRef,
  lockCompetitionCatalog,
} from "./catalog-lock";
