import { describe, expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { createEconomyService } from "../../modules/economy/economy.service";
import {
  createAdminService,
  type AdminService,
} from "../../modules/admin/admin.service";
import { createAdminHandler } from "../../modules/admin/admin.handler";
import { createAdminRouter } from "../../modules/admin/admin.router";
import { EconomyConfigConflictError } from "../../modules/admin/admin.errors";
import { DEFAULT_V3_ECONOMY_CONFIG } from "../../modules/pricing/v3-economy.config";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { EconomyRepo } from "../../modules/economy/economy.repo";
import type { Context } from "../../context";

describe("V3 economy draft service", () => {
  test("historical revisions are parsed and unavailable versions stay unavailable", async () => {
    const db = {} as DbType;
    const tx = {} as DbOrTx;
    const getV3RevisionByVersion = mock(async (): Promise<unknown> => null)
      .mockResolvedValueOnce({ version: 7, values: DEFAULT_V3_ECONOMY_CONFIG })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 8, values: { invalid: true } });
    const service = createEconomyService({
      db,
      repo: { getV3RevisionByVersion } as unknown as EconomyRepo,
    });
    expect(await service.getV3ConfigByVersion(7)).toEqual({
      version: 7,
      values: DEFAULT_V3_ECONOMY_CONFIG,
    });
    expect(getV3RevisionByVersion).toHaveBeenLastCalledWith(db, 7);
    await expect(service.getV3ConfigByVersion(99, tx)).resolves.toBeNull();
    expect(getV3RevisionByVersion).toHaveBeenLastCalledWith(tx, 99);
    await expect(service.getV3ConfigByVersion(8)).rejects.toThrow();
  });
  test("empty storage returns defaults as revision zero without writing", async () => {
    const repo = { getLatestV3Revision: mock(async () => null) };
    const service = createEconomyService({
      db: {} as DbType,
      repo: repo as unknown as EconomyRepo,
    });
    const result = await service.getV3Config();
    expect(result).toMatchObject({
      version: 0,
      status: "draft",
      values: DEFAULT_V3_ECONOMY_CONFIG,
    });
    result.values.packages[0]!.priceIdr = 1;
    expect((await service.getV3Config()).values.packages[0]!.priceIdr).toBe(
      350000,
    );
  });

  test("saved revisions are parsed rather than silently falling back to defaults", async () => {
    const service = createEconomyService({
      db: {} as DbType,
      repo: {
        getLatestV3Revision: async () => ({
          version: 2,
          values: { invalid: true },
        }),
      } as unknown as EconomyRepo,
    });
    await expect(service.getV3Config()).rejects.toThrow();
  });

  test("preview returns all 84 rows and keeps both top-up alternatives", () => {
    const service = createEconomyService({ db: {} as DbType });
    const result = service.previewV3Config(DEFAULT_V3_ECONOMY_CONFIG, 440);
    expect(result.status).toBe("draft");
    expect(result.sessions).toHaveLength(84);
    expect(result.topUp).toMatchObject({
      marks: 440,
      amountIdr: 2750000,
      recommendation: { marks: 500 },
    });
  });

  test("preview includes a configured dynamic parent rate", () => {
    const config = structuredClone(DEFAULT_V3_ECONOMY_CONFIG);
    config.competitionRates["competition-policy-debate"] = {
      soloMarks: 41,
      soloFeeIdr: 123000,
    };
    const service = createEconomyService({ db: {} as DbType });
    const result = service.previewV3Config(config);
    expect(result.sessions).toHaveLength(96);
    expect(
      result.sessions.find(
        (session) => session.competition === "competition-policy-debate",
      ),
    ).toMatchObject({ headcount: 1, perStudentMarks: 41, tutorFeeIdr: 123000 });
  });
});

function setupAdmin() {
  const tx = { execute: mock(async () => undefined) } as unknown as DbOrTx;
  const db = {
    transaction: mock(async (fn: (conn: DbOrTx) => Promise<unknown>) => fn(tx)),
  };
  const economy = {
    getV3ConfigByVersion: mock(async () => ({
      version: 1,
      values: structuredClone(DEFAULT_V3_ECONOMY_CONFIG),
    })),
    activateV3Config: mock(
      async () => ({ version: 1 }) as { version: number } | null,
    ),
    getActiveV3Config: mock(
      async () =>
        null as {
          version: number;
          values: typeof DEFAULT_V3_ECONOMY_CONFIG;
        } | null,
    ),
    getV3Config: mock(async () => ({
      version: 0,
      values: structuredClone(DEFAULT_V3_ECONOMY_CONFIG),
      status: "draft",
    })),
    saveV3Config: mock(
      async () =>
        ({
          version: 1,
          values: structuredClone(DEFAULT_V3_ECONOMY_CONFIG),
          reason: "Initial rates",
          createdBy: "admin1",
          createdAt: new Date(),
        }) as unknown,
    ),
    previewV3Config: mock(() => ({
      status: "draft",
      sessions: [],
      topUp: null,
    })),
  };
  const audit = { record: mock(async (_input: unknown) => {}) };
  const competitionCatalog = {
    listParents: mock(async () =>
      Object.keys(DEFAULT_V3_ECONOMY_CONFIG.competitionRates).map((slug) => ({
        id: slug,
        slug,
        name: slug,
        isActive: true,
        rateConfigured: true,
      })),
    ),
  };
  const service = createAdminService({
    db,
    economy,
    auditPort: audit,
    competitionCatalog,
  } as unknown as Parameters<typeof createAdminService>[0]);
  return { tx, db, economy, audit, competitionCatalog, service };
}

const saveInput = () => ({
  expectedVersion: 0,
  values: structuredClone(DEFAULT_V3_ECONOMY_CONFIG),
  reason: "Initial rates",
});

describe("V3 admin revision transaction", () => {
  test("save and audit share one transaction and retain before/after/reason", async () => {
    const { tx, db, economy, audit, service } = setupAdmin();
    expect(
      await service.saveV3EconomySettings("admin1", saveInput()),
    ).toMatchObject({ version: 1, status: "draft" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(economy.saveV3Config).toHaveBeenCalledWith(tx, {
      ...saveInput(),
      createdBy: "admin1",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        actorId: "admin1",
        action: "economy_v3_revision_created",
        beforeState: { version: 0, values: DEFAULT_V3_ECONOMY_CONFIG },
        afterState: { version: 1, values: DEFAULT_V3_ECONOMY_CONFIG },
        details: { reason: "Initial rates", status: "draft" },
      }),
    );
  });

  test("settings expose the active revision independently of the latest draft", async () => {
    const { service, economy } = setupAdmin();
    economy.getActiveV3Config.mockResolvedValue({
      version: 7,
      values: DEFAULT_V3_ECONOMY_CONFIG,
    });
    expect(await service.getV3EconomySettings()).toMatchObject({
      activeRevision: 7,
      version: 0,
    });
  });

  test("settings list catalog parents with their saved rate readiness", async () => {
    const { service, competitionCatalog } = setupAdmin();
    competitionCatalog.listParents.mockImplementation(
      async () =>
        [
          {
            id: "competition-debate",
            slug: "competition-debate",
            name: "Debate",
            isActive: true,
            rateConfigured: true,
          },
          {
            id: "new-parent",
            slug: "competition-policy-debate",
            name: "Policy Debate",
            isActive: false,
            rateConfigured: false,
          },
        ] as any,
    );
    const settings = await service.getV3EconomySettings();
    expect(settings.competitions).toMatchObject([
      { slug: "competition-debate", rateConfigured: true },
      {
        slug: "competition-policy-debate",
        isActive: false,
        rateConfigured: false,
        rate: null,
      },
    ]);
  });

  test("save rejects valid-looking slugs that are not catalog parents", async () => {
    const { service } = setupAdmin();
    const input = saveInput();
    input.values.competitionRates["competition-not-in-catalog"] = {
      soloMarks: 40,
      soloFeeIdr: 150000,
    };
    await expect(
      service.saveV3EconomySettings("admin1", input),
    ).rejects.toMatchObject({ code: "ECONOMY_COMPETITION_NOT_IN_CATALOG" });
  });

  test("stale version rejects and never writes a success audit", async () => {
    const { economy, audit, service } = setupAdmin();
    economy.saveV3Config.mockImplementation(async () => null);
    await expect(
      service.saveV3EconomySettings("admin1", saveInput()),
    ).rejects.toBeInstanceOf(EconomyConfigConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  test("audit failure rejects the transaction rather than reporting successful save", async () => {
    const { audit, service } = setupAdmin();
    audit.record.mockImplementation(async () => {
      throw new Error("audit unavailable");
    });
    await expect(
      service.saveV3EconomySettings("admin1", saveInput()),
    ).rejects.toThrow("audit unavailable");
  });

  test("invalid direct-service input never starts a write transaction", async () => {
    const { db, service } = setupAdmin();
    await expect(
      service.saveV3EconomySettings("admin1", { ...saveInput(), reason: " " }),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("V3 admin RPC role checks", () => {
  const get = mock(async () => ({
    version: 0,
    values: DEFAULT_V3_ECONOMY_CONFIG,
    status: "draft",
  }));
  const preview = mock(() => ({ status: "draft", sessions: [], topUp: null }));
  const save = mock(async () => ({ version: 1, status: "draft" }));
  const router = createAdminRouter(
    createAdminHandler({
      activateV3EconomySettings: mock(async () => ({ activeRevision: 1 })),
      getV3EconomySettings: get,
      previewV3EconomySettings: preview,
      saveV3EconomySettings: save,
    } as unknown as AdminService),
  );

  for (const role of [null, "student", "tutor"]) {
    test(`rejects ${role ?? "anonymous"} on get, preview and save`, async () => {
      const client = createRouterClient(router, {
        context: {
          session: role ? { user: { id: "u1", role } } : null,
        } as unknown as Context,
      });
      await expect(
        client.activateV3EconomySettings({
          version: 1,
          expectedActiveRevision: null,
          reason: "Approved",
        }),
      ).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHORIZED" });
      const code = role ? "FORBIDDEN" : "UNAUTHORIZED";
      await expect(client.getV3EconomySettings()).rejects.toMatchObject({
        code,
      });
      await expect(
        client.previewV3EconomySettings({ values: DEFAULT_V3_ECONOMY_CONFIG }),
      ).rejects.toMatchObject({ code });
      await expect(
        client.saveV3EconomySettings(saveInput()),
      ).rejects.toMatchObject({ code });
    });
  }

  test("admin can preview and save; malformed payload is rejected", async () => {
    const client = createRouterClient(router, {
      context: {
        session: { user: { id: "admin1", role: "admin" } },
      } as unknown as Context,
    });
    await expect(client.getV3EconomySettings()).resolves.toMatchObject({
      version: 0,
    });
    await expect(
      client.previewV3EconomySettings({ values: DEFAULT_V3_ECONOMY_CONFIG }),
    ).resolves.toMatchObject({ status: "draft" });
    await expect(
      client.saveV3EconomySettings(saveInput()),
    ).resolves.toMatchObject({ version: 1 });
    expect(save).toHaveBeenCalledWith("admin1", saveInput());
    await expect(
      client.saveV3EconomySettings({ ...saveInput(), reason: " " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("V3 pricing activation", () => {
  const input = {
    version: 1,
    expectedActiveRevision: null,
    reason: "Approved pricing",
  };
  test("activates and audits in the same transaction", async () => {
    const { service, economy, audit, tx } = setupAdmin();
    expect(await service.activateV3EconomySettings("admin1", input)).toEqual({
      activeRevision: 1,
    });
    expect(economy.activateV3Config).toHaveBeenCalledWith(tx, {
      ...input,
      updatedBy: "admin1",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        db: tx,
        action: "economy_v3_revision_activated",
        beforeState: { activeRevision: null },
        afterState: { activeRevision: 1 },
      }),
    );
  });
  test("stale activation never emits a success audit", async () => {
    const { service, economy, audit } = setupAdmin();
    economy.activateV3Config.mockResolvedValue(null);
    await expect(
      service.activateV3EconomySettings("admin1", input),
    ).rejects.toBeInstanceOf(EconomyConfigConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });
  test("audit failure rejects activation transaction", async () => {
    const { service, audit } = setupAdmin();
    audit.record.mockRejectedValue(new Error("audit unavailable"));
    await expect(
      service.activateV3EconomySettings("admin1", input),
    ).rejects.toThrow("audit unavailable");
  });
  test("invalid reason fails before opening a transaction", async () => {
    const { service, db } = setupAdmin();
    await expect(
      service.activateV3EconomySettings("admin1", { ...input, reason: " " }),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
