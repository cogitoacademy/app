import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { createEconomyRepo, type EconomyRepo } from "./economy.repo";
import type { EconomyConfigUpdate } from "./economy.types";
import {
  DEFAULT_V3_ECONOMY_CONFIG,
  v3EconomyConfigSchema,
} from "../pricing/v3-economy.config";
import {
  calculateV3SessionPrice,
  calculateV3TopUpPrice,
} from "../pricing/v3-rate-card";

function previewV3Config(values: unknown, exactMarks?: number) {
  const config = v3EconomyConfigSchema.parse(values);
  return {
    status: "draft" as const,
    sessions: Object.keys(config.competitionRates).flatMap((competition) =>
      (["online", "offline"] as const).flatMap((modality) =>
        [1, 2, 3, 4, 5, 6].map((headcount) =>
          calculateV3SessionPrice({ competition, modality, headcount }, config),
        ),
      ),
    ),
    topUp:
      exactMarks === undefined
        ? null
        : calculateV3TopUpPrice(exactMarks, config),
  };
}

export function createEconomyService(deps: { db: DbType; repo?: EconomyRepo }) {
  const repo = deps.repo ?? createEconomyRepo();

  async function getConfig(conn: DbOrTx = deps.db) {
    return repo.getOrCreate(conn);
  }

  async function updateConfig(
    conn: DbOrTx,
    input: {
      expectedVersion: number;
      updatedBy: string;
      values: EconomyConfigUpdate;
    },
  ) {
    await repo.getOrCreate(conn);
    const [updated] = await repo.updateWithVersion(
      conn,
      input.expectedVersion,
      input.updatedBy,
      input.values,
    );
    return updated ?? null;
  }

  async function getV3Config(conn: DbOrTx = deps.db) {
    const row = await repo.getLatestV3Revision(conn);
    return {
      version: row?.version ?? 0,
      values: v3EconomyConfigSchema.parse(
        row?.values ?? DEFAULT_V3_ECONOMY_CONFIG,
      ),
      status: "draft" as const,
      createdAt: row?.createdAt ?? null,
      createdBy: row?.createdBy ?? null,
      reason: row?.reason ?? null,
    };
  }

  async function getV3ConfigByVersion(version: number, conn: DbOrTx = deps.db) {
    const row = await repo.getV3RevisionByVersion(conn, version);
    return row
      ? {
          version: row.version,
          values: v3EconomyConfigSchema.parse(row.values),
        }
      : null;
  }

  async function getActiveV3Config(conn: DbOrTx = deps.db) {
    const row = await repo.getActiveV3Revision(conn);
    return row
      ? {
          version: row.version,
          values: v3EconomyConfigSchema.parse(row.values),
        }
      : null;
  }

  async function saveV3Config(
    conn: DbOrTx,
    input: {
      expectedVersion: number;
      values: unknown;
      reason: string;
      createdBy: string;
    },
  ) {
    const values = v3EconomyConfigSchema.parse(input.values);
    return repo.appendV3Revision(conn, { ...input, values });
  }

  return {
    getConfig,
    updateConfig,
    getV3Config,
    getV3ConfigByVersion,
    getActiveV3Config,
    previewV3Config,
    saveV3Config,
    activateV3Config: repo.activateV3Revision,
  };
}

export type EconomyService = ReturnType<typeof createEconomyService>;
