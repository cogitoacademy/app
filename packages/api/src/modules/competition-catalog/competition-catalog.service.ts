import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import { createCompetitionCatalogRepo } from "./competition-catalog.repo";
import type { CompetitionCatalogRepo } from "./competition-catalog.repo";
import type { CompetitionCatalogRow } from "./competition-catalog.repo";
import type { AuditPort } from "../audit/audit.service";
import type { EconomyService } from "../economy/economy.service";
import { lockCompetitionCatalog } from "./catalog-lock";
import {
  CompetitionCatalogEntryNotFoundError,
  CompetitionCatalogInUseError,
  CompetitionCatalogInvalidOperationError,
  CompetitionCatalogSlugConflictError,
  CompetitionCatalogStateConflictError,
  CompetitionCatalogVersionConflictError,
} from "./competition-catalog.errors";
import {
  competitionPaletteInput,
  createCompetitionParentInput,
  createCompetitionSpecializationInput,
  getCompetitionCatalogEntryInput,
  listCompetitionCatalogInput,
  moveCompetitionSpecializationInput,
  mutateCompetitionCatalogEntryInput,
  previewCompetitionCatalogImpactInput,
  updateCompetitionCatalogEntryInput,
} from "./competition-catalog.types";
import type {
  CompetitionPalette,
  CreateCompetitionParentInput,
  CreateCompetitionSpecializationInput,
  ListCompetitionCatalogInput,
  MoveCompetitionSpecializationInput,
  MutateCompetitionCatalogEntryInput,
  CompetitionPaletteReference,
  UpdateCompetitionCatalogEntryInput,
} from "./competition-catalog.types";

type ImpactCounts = {
  tutorAssignments: number;
  pendingProfileEdits: number;
  bookings: number;
  bookingSessions: number;
  historicalTutorProfileAudits: number;
  economyRevisions: number;
  defaultRates: number;
  calendarEvents?: number;
};

function snapshot(row: CompetitionCatalogRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    slug: row.slug,
    name: row.name,
    nameId: row.nameId,
    description: row.description,
    descriptionId: row.descriptionId,
    lightTextColor: row.lightTextColor,
    lightBackgroundColor: row.lightBackgroundColor,
    darkTextColor: row.darkTextColor,
    darkBackgroundColor: row.darkBackgroundColor,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    version: row.version,
  };
}

function isUsed(counts: ImpactCounts) {
  return Object.values(counts).some((count) => (count ?? 0) > 0);
}

function addReadiness<
  T extends {
    slug: string;
    parentId: string | null;
    isActive: boolean;
    lightTextColor: string | null;
    lightBackgroundColor: string | null;
    darkTextColor: string | null;
    darkBackgroundColor: string | null;
    parent?: {
      slug: string;
      isActive: boolean;
      lightTextColor: string | null;
      lightBackgroundColor: string | null;
      darkTextColor: string | null;
      darkBackgroundColor: string | null;
    } | null;
  },
>(row: T, rateSlugs: Set<string>) {
  const root = row.parentId === null ? row : row.parent;
  const rateConfigured = Boolean(root && rateSlugs.has(root.slug));
  const selectable = Boolean(row.isActive && root?.isActive && rateConfigured);
  const parentColors = root ? getPalette(root) : null;
  return { ...row, rateConfigured, selectable, parentColors };
}

function getPalette(row: {
  lightTextColor: string | null;
  lightBackgroundColor: string | null;
  darkTextColor: string | null;
  darkBackgroundColor: string | null;
}): CompetitionPalette {
  if (
    row.lightTextColor === null ||
    row.lightBackgroundColor === null ||
    row.darkTextColor === null ||
    row.darkBackgroundColor === null
  ) {
    throw new Error("Competition parent is missing its color palette");
  }
  return competitionPaletteInput.parse({
    lightTextColor: row.lightTextColor,
    lightBackgroundColor: row.lightBackgroundColor,
    darkTextColor: row.darkTextColor,
    darkBackgroundColor: row.darkBackgroundColor,
  });
}

function hasUniqueViolation(error: unknown): boolean {
  let current = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export function createCompetitionCatalogService(deps: {
  db: DbType;
  audit: AuditPort;
  economy: EconomyService;
  repo?: CompetitionCatalogRepo;
  includeCalendarReferences?: boolean;
}) {
  const repo = deps.repo ?? createCompetitionCatalogRepo();

  async function getEntryOrThrow(tx: TxClient, id: string) {
    const row = await repo.getCompetitionCatalogEntry(tx, id);
    if (!row) throw new CompetitionCatalogEntryNotFoundError(id);
    return row;
  }

  function assertExpectedVersion(
    row: CompetitionCatalogRow,
    expectedVersion: number,
  ) {
    if (row.version !== expectedVersion) {
      throw new CompetitionCatalogVersionConflictError(
        row.id,
        expectedVersion,
        row.version,
      );
    }
  }

  async function hasConfiguredRate(
    tx: TxClient,
    competition: CompetitionCatalogRow,
  ) {
    const config = await deps.economy.getV3Config(tx);
    return Object.hasOwn(config.values.competitionRates, competition.slug);
  }

  async function decorateForRead(
    tx: TxClient,
    row: CompetitionCatalogRow,
    parentOverride?: CompetitionCatalogRow,
  ) {
    const parent =
      row.parentId === null
        ? row
        : (parentOverride ?? (await getEntryOrThrow(tx, row.parentId)));
    const config = await deps.economy.getV3Config(tx);
    const hydrated = row.parentId === null ? row : { ...row, parent };
    return addReadiness(
      hydrated,
      new Set(Object.keys(config.values.competitionRates)),
    );
  }

  async function getImpact(tx: TxClient, row: CompetitionCatalogRow) {
    const children =
      row.parentId === null
        ? await repo.listCompetitionCatalogChildren(tx, row.id)
        : [];
    const entries = [row, ...children];
    const references = await repo.countCompetitionCatalogReferences(
      tx,
      entries,
      deps.includeCalendarReferences ?? false,
    );
    return {
      childCount: children.length,
      references,
      totalReferences: Object.values(references).reduce(
        (total, count) => total + count,
        0,
      ),
    };
  }

  async function recordMutation(
    tx: TxClient,
    input: {
      adminId: string;
      action: string;
      before: CompetitionCatalogRow | null;
      after: CompetitionCatalogRow | null;
      reason: string;
      extra?: Record<string, unknown>;
    },
  ) {
    const row = input.after ?? input.before!;
    await deps.audit.record({
      db: tx,
      actorId: input.adminId,
      actorType: "admin",
      action: input.action,
      targetId: row.id,
      targetType: "competition_catalog_entry",
      beforeState: input.before ? snapshot(input.before) : undefined,
      afterState: input.after
        ? snapshot(input.after)
        : { ...snapshot(input.before!), deleted: true },
      details: { reason: input.reason, ...input.extra },
    });
  }

  async function list(input: ListCompetitionCatalogInput) {
    const parsed = listCompetitionCatalogInput.parse(input);
    const [rows, config] = await Promise.all([
      repo.listCompetitionCatalog(deps.db, {
        ...parsed,
        includeArchived: true,
      }),
      deps.economy.getV3Config(),
    ]);
    const rateSlugs = new Set(Object.keys(config.values.competitionRates));
    const entries = rows.map((row) => addReadiness(row, rateSlugs));
    return parsed.includeArchived
      ? entries
      : entries.filter((entry) => entry.selectable);
  }

  async function listParents(conn: DbType | TxClient = deps.db) {
    const [rows, config] = await Promise.all([
      repo.listCompetitionCatalog(conn, { includeArchived: true }),
      deps.economy.getV3Config(conn),
    ]);
    const rateSlugs = new Set(Object.keys(config.values.competitionRates));
    return rows
      .filter((row) => row.parentId === null)
      .map((row) => addReadiness(row, rateSlugs));
  }

  async function get(input: { id: string }) {
    const parsed = getCompetitionCatalogEntryInput.parse(input);
    const row = await repo.getCompetitionCatalogEntry(deps.db, parsed.id);
    if (!row) throw new CompetitionCatalogEntryNotFoundError(parsed.id);
    const config = await deps.economy.getV3Config();
    const rateSlugs = new Set(Object.keys(config.values.competitionRates));
    const entry = addReadiness(row, rateSlugs);
    if (entry.parentId !== null) return entry;
    return {
      ...entry,
      children: row.children.map((child) =>
        addReadiness({ ...child, parent: row }, rateSlugs),
      ),
    };
  }

  async function resolveCompetitionPalettes(
    references: readonly CompetitionPaletteReference[],
  ) {
    const normalized = references.map((reference) => ({
      id: reference.id?.trim() || undefined,
      slug: reference.slug?.trim() || undefined,
    }));
    const ids = [...new Set(normalized.flatMap(({ id }) => (id ? [id] : [])))];
    const slugs = [
      ...new Set(normalized.flatMap(({ slug }) => (slug ? [slug] : []))),
    ];
    const rows = await repo.getCompetitionCatalogEntriesByReferences(deps.db, {
      ids,
      slugs,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    return normalized.map(({ id, slug }) => {
      const row =
        (id ? byId.get(id) : undefined) ??
        (slug ? bySlug.get(slug) : undefined);
      if (!row) return null;
      const root = row.parentId === null ? row : row.parent;
      return root ? getPalette(root) : null;
    });
  }

  async function resolveCompetitionPalette(
    reference: CompetitionPaletteReference,
  ) {
    const [palette] = await resolveCompetitionPalettes([reference]);
    return palette ?? null;
  }

  async function previewImpact(input: { id: string }) {
    const parsed = previewCompetitionCatalogImpactInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const row = await getEntryOrThrow(tx, parsed.id);
      const config = await deps.economy.getV3Config(tx);
      const rateSlugs = new Set(Object.keys(config.values.competitionRates));
      return {
        entry: addReadiness(row, rateSlugs),
        ...(await getImpact(tx, row)),
      };
    });
  }

  async function createParent(
    adminId: string,
    input: CreateCompetitionParentInput,
  ) {
    const parsed = createCompetitionParentInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      let row: CompetitionCatalogRow;
      try {
        row = await repo.insertCompetitionParent(tx, parsed);
      } catch (error) {
        if (hasUniqueViolation(error)) {
          throw new CompetitionCatalogSlugConflictError(parsed.slug);
        }
        throw error;
      }
      await recordMutation(tx, {
        adminId,
        action: "competition_catalog_parent_created",
        before: null,
        after: row,
        reason: parsed.reason,
      });
      return decorateForRead(tx, row);
    });
  }

  async function createSpecialization(
    adminId: string,
    input: CreateCompetitionSpecializationInput,
  ) {
    const parsed = createCompetitionSpecializationInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const parent = await getEntryOrThrow(tx, parsed.parentId);
      if (parent.parentId !== null) {
        throw new CompetitionCatalogInvalidOperationError(
          "A specialization must belong directly to a competition.",
        );
      }
      const isActive = parent.isActive && (await hasConfiguredRate(tx, parent));
      let row: CompetitionCatalogRow;
      try {
        row = await repo.insertCompetitionSpecialization(tx, parsed, isActive);
      } catch (error) {
        if (hasUniqueViolation(error)) {
          throw new CompetitionCatalogSlugConflictError(parsed.slug);
        }
        throw error;
      }
      await recordMutation(tx, {
        adminId,
        action: "competition_catalog_specialization_created",
        before: null,
        after: row,
        reason: parsed.reason,
        extra: { parentColors: getPalette(parent) },
      });
      return decorateForRead(tx, row, parent);
    });
  }

  async function update(
    adminId: string,
    input: UpdateCompetitionCatalogEntryInput,
  ) {
    const parsed = updateCompetitionCatalogEntryInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const before = await getEntryOrThrow(tx, parsed.id);
      assertExpectedVersion(before, parsed.expectedVersion);
      const paletteFields = [
        parsed.lightTextColor,
        parsed.lightBackgroundColor,
        parsed.darkTextColor,
        parsed.darkBackgroundColor,
      ];
      if (
        paletteFields.some((value) => value !== undefined) &&
        before.parentId !== null
      ) {
        throw new CompetitionCatalogInvalidOperationError(
          "Specializations inherit their competition palette and cannot override it.",
        );
      }
      const after = await repo.updateCompetitionCatalogEntry(tx, parsed);
      if (!after) {
        const current = await getEntryOrThrow(tx, parsed.id);
        assertExpectedVersion(current, parsed.expectedVersion);
      }
      await recordMutation(tx, {
        adminId,
        action: "competition_catalog_entry_updated",
        before,
        after: after!,
        reason: parsed.reason,
      });
      return decorateForRead(tx, after!);
    });
  }

  async function moveSpecialization(
    adminId: string,
    input: MoveCompetitionSpecializationInput,
  ) {
    const parsed = moveCompetitionSpecializationInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const before = await getEntryOrThrow(tx, parsed.id);
      assertExpectedVersion(before, parsed.expectedVersion);
      if (before.parentId === null) {
        throw new CompetitionCatalogInvalidOperationError(
          "A competition cannot be moved or converted into a specialization.",
        );
      }
      if (before.parentId === parsed.parentId) {
        throw new CompetitionCatalogInvalidOperationError(
          "Choose a different competition for this specialization.",
        );
      }
      const destination = await getEntryOrThrow(tx, parsed.parentId);
      if (destination.parentId !== null) {
        throw new CompetitionCatalogInvalidOperationError(
          "A specialization can only move under a competition.",
        );
      }
      const impact = await getImpact(tx, before);
      if (isUsed(impact.references)) {
        throw new CompetitionCatalogInUseError(before.id, impact.references);
      }
      if (
        before.isActive &&
        destination.isActive &&
        !(await hasConfiguredRate(tx, destination))
      ) {
        throw new CompetitionCatalogStateConflictError(
          "The destination competition has no configured rate.",
          { parentId: destination.id },
        );
      }
      const isActive = before.isActive && destination.isActive;
      const after = await repo.moveCompetitionSpecialization(
        tx,
        parsed,
        isActive,
      );
      if (!after) {
        const current = await getEntryOrThrow(tx, parsed.id);
        assertExpectedVersion(current, parsed.expectedVersion);
      }
      await recordMutation(tx, {
        adminId,
        action: "competition_catalog_specialization_moved",
        before,
        after: after!,
        reason: parsed.reason,
        extra: {
          destinationParentId: destination.id,
          previousParentColors: before.parent
            ? getPalette(before.parent)
            : null,
          destinationParentColors: getPalette(destination),
        },
      });
      return decorateForRead(tx, after!, destination);
    });
  }

  async function setActive(
    adminId: string,
    input: MutateCompetitionCatalogEntryInput,
    isActive: boolean,
  ) {
    const parsed = mutateCompetitionCatalogEntryInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const before = await getEntryOrThrow(tx, parsed.id);
      assertExpectedVersion(before, parsed.expectedVersion);
      if (before.isActive === isActive) {
        throw new CompetitionCatalogStateConflictError(
          isActive
            ? "Catalog entry is already active."
            : "Catalog entry is already archived.",
          { id: before.id },
        );
      }

      if (isActive) {
        const parent =
          before.parentId === null
            ? before
            : await getEntryOrThrow(tx, before.parentId);
        if (
          parent.parentId !== null ||
          (before.parentId !== null && !parent.isActive)
        ) {
          throw new CompetitionCatalogStateConflictError(
            "A specialization can only be restored under an active competition.",
            { id: before.id, parentId: parent.id },
          );
        }
        if (!(await hasConfiguredRate(tx, parent))) {
          throw new CompetitionCatalogStateConflictError(
            "The competition cannot be restored until its rates are configured.",
            { id: parent.id },
          );
        }
      }

      const after = await repo.setCompetitionCatalogEntryActive(tx, {
        id: parsed.id,
        expectedVersion: parsed.expectedVersion,
        isActive,
      });
      if (!after) {
        const current = await getEntryOrThrow(tx, parsed.id);
        assertExpectedVersion(current, parsed.expectedVersion);
      }
      const impact = await getImpact(tx, before);
      await recordMutation(tx, {
        adminId,
        action: isActive
          ? "competition_catalog_entry_restored"
          : "competition_catalog_entry_archived",
        before,
        after: after!,
        reason: parsed.reason,
        extra: { affected: impact },
      });
      return {
        entry: await decorateForRead(
          tx,
          after!,
          before.parentId === null
            ? undefined
            : await getEntryOrThrow(tx, before.parentId),
        ),
        affected: impact,
      };
    });
  }

  async function remove(
    adminId: string,
    input: MutateCompetitionCatalogEntryInput,
  ) {
    const parsed = mutateCompetitionCatalogEntryInput.parse(input);
    return deps.db.transaction(async (tx) => {
      await lockCompetitionCatalog(tx);
      const before = await getEntryOrThrow(tx, parsed.id);
      assertExpectedVersion(before, parsed.expectedVersion);
      const childCount = await repo.countCompetitionCatalogChildren(
        tx,
        before.id,
      );
      if (before.parentId === null && childCount > 0) {
        throw new CompetitionCatalogInUseError(before.id, {
          children: childCount,
        });
      }
      const impact = await getImpact(tx, before);
      if (isUsed(impact.references)) {
        throw new CompetitionCatalogInUseError(before.id, impact.references);
      }
      const deleted = await repo.deleteCompetitionCatalogEntry(tx, {
        id: parsed.id,
        expectedVersion: parsed.expectedVersion,
      });
      if (!deleted) {
        const current = await getEntryOrThrow(tx, parsed.id);
        assertExpectedVersion(current, parsed.expectedVersion);
      }
      await recordMutation(tx, {
        adminId,
        action: "competition_catalog_entry_deleted",
        before,
        after: null,
        reason: parsed.reason,
        extra: { affected: impact },
      });
      return { deleted: snapshot(deleted!) };
    });
  }

  return {
    list,
    listParents,
    get,
    resolveCompetitionPalette,
    resolveCompetitionPalettes,
    previewImpact,
    createParent,
    createSpecialization,
    update,
    moveSpecialization,
    archive: (adminId: string, input: MutateCompetitionCatalogEntryInput) =>
      setActive(adminId, input, false),
    restore: (adminId: string, input: MutateCompetitionCatalogEntryInput) =>
      setActive(adminId, input, true),
    remove,
  };
}

export type CompetitionCatalogService = ReturnType<
  typeof createCompetitionCatalogService
>;
export type CompetitionPaletteResolver = Pick<
  CompetitionCatalogService,
  "resolveCompetitionPalette" | "resolveCompetitionPalettes"
>;
