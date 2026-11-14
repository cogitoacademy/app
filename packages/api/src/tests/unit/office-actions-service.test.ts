import { afterEach, describe, expect, mock, test } from "bun:test";
import { executeOfficeAction } from "../../modules/office/office-actions";
import { officeActionReceipt } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { StoragePort } from "../../lib/storage";

const originalWrites = process.env.OFFICE_WRITES_ENABLED;
afterEach(() => {
  if (originalWrites === undefined) delete process.env.OFFICE_WRITES_ENABLED;
  else process.env.OFFICE_WRITES_ENABLED = originalWrites;
});
const envelope = (input: unknown) => ({
  input,
  dryRun: false,
  idempotencyKey: crypto.randomUUID(),
  officeItemId: "office-item",
  requestedBy: "Requester",
  approvedBy: "Approver",
});
function fixture(receipts: unknown[] = []) {
  const writes = mock(() => {
    throw new Error("Unexpected write");
  });
  const selects: unknown[] = [];
  const tx = {
    execute: mock(async () => []),
    select: () => ({
      from(table: unknown) {
        selects.push(table);
        type Query = Promise<unknown[]> & {
          where: () => Query;
          orderBy: () => Query;
          limit: () => Query;
        };
        const query = Promise.resolve(
          table === officeActionReceipt ? receipts : [],
        ) as Query;
        query.where = () => query;
        query.orderBy = () => query;
        query.limit = () => query;
        return query;
      },
    }),
    insert: writes,
    update: writes,
  };
  const database = {
    transaction: mock(async (work: (tx: unknown) => unknown) => work(tx)),
  } as unknown as DbType;
  const storage = {
    put: mock(async () => ({ key: "unused", url: "unused" })),
    resolvePublicUrl: () => "unused",
    getSignedUploadUrl: mock(async () => {
      throw new Error("Unexpected upload");
    }),
  } satisfies StoragePort;
  return { database, storage, tx, selects, writes, authoringEnabled: true };
}

describe("Office action service failure and replay boundaries", () => {
  test("disabled switch denies malformed requests before opening a transaction", async () => {
    delete process.env.OFFICE_WRITES_ENABLED;
    const config = fixture();
    expect(await executeOfficeAction("unknown", null, config)).toMatchObject({
      ok: false,
      code: "OFFICE_WRITES_DISABLED",
    });
    expect(config.database.transaction).not.toHaveBeenCalled();
  });
  test("enabled switch still rejects invalid input and denied actions before DB access", async () => {
    process.env.OFFICE_WRITES_ENABLED = "true";
    const config = fixture();
    await expect(
      executeOfficeAction("faq.publish", envelope({}), config),
    ).rejects.toThrow();
    await expect(
      executeOfficeAction("wallet.credit", envelope({}), config),
    ).rejects.toThrow("OFFICE_ACTION_DENIED");
    expect(config.database.transaction).not.toHaveBeenCalled();
  });
  test("fresh receipt returns stored result without invoking services, storage or writes", async () => {
    process.env.OFFICE_WRITES_ENABLED = "true";
    const result = {
      ok: true,
      id: "already-written",
      result: { stable: true },
    };
    const config = fixture([{ createdAt: new Date(), result }]);
    expect(
      await executeOfficeAction(
        "faq.publish",
        envelope({ id: "target" }),
        config,
      ),
    ).toBe(result);
    expect(config.tx.execute).toHaveBeenCalledTimes(1);
    expect(config.selects).toEqual([officeActionReceipt]);
    expect(config.writes).not.toHaveBeenCalled();
    expect(config.storage.put).not.toHaveBeenCalled();
  });
  for (const name of [
    "calendar.publish",
    "activities.publish",
    "faq.publish",
  ]) {
    test(`${name} rejects missing target without writing a receipt`, async () => {
      process.env.OFFICE_WRITES_ENABLED = "true";
      const config = fixture();
      await expect(
        executeOfficeAction(name, envelope({ id: "missing" }), config),
      ).rejects.toThrow("OFFICE_TARGET_NOT_FOUND");
      expect(config.writes).not.toHaveBeenCalled();
    });
  }
  test("expired receipt cannot replay a stale success and reruns target validation", async () => {
    process.env.OFFICE_WRITES_ENABLED = "true";
    const config = fixture([
      { createdAt: new Date(Date.now() - 8 * 86400_000), result: { ok: true } },
    ]);
    await expect(
      executeOfficeAction("faq.publish", envelope({ id: "removed" }), config),
    ).rejects.toThrow("OFFICE_TARGET_NOT_FOUND");
    expect(config.selects.length).toBeGreaterThan(1);
    expect(config.writes).not.toHaveBeenCalled();
  });
  test("transaction failure propagates instead of becoming a preview success", async () => {
    process.env.OFFICE_WRITES_ENABLED = "true";
    const failure = new Error("transaction unavailable");
    const config = fixture();
    config.database = {
      transaction: async () => {
        throw failure;
      },
    } as unknown as DbType;
    await expect(
      executeOfficeAction("faq.publish", envelope({ id: "target" }), config),
    ).rejects.toBe(failure);
  });
  for (const [label, bytes, contentType] of [
    ["invalid signature", Buffer.from("not an image"), "image/png"],
    ["PNG MIME mismatch", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/jpeg"],
    ["JPEG MIME mismatch", Buffer.from([0xff, 0xd8, 0xff]), "image/png"],
  ] as const) {
    test(`rejects ${label} before storing blog cover or writing DB`, async () => {
      process.env.OFFICE_WRITES_ENABLED = "true";
      const config = fixture();
      const fetcher = mock(
        async () =>
          new Response(bytes, { headers: { "content-type": contentType } }),
      ) as unknown as typeof fetch;
      await expect(
        executeOfficeAction(
          "blog.saveDraft",
          envelope({
            title: "Article",
            lang: "id",
            category: "category",
            body: [{ type: "paragraph", runs: [{ text: "Body" }] }],
            coverImageUrl: "https://office.cogitoacademy.id/cover",
          }),
          { ...config, fetcher },
        ),
      ).rejects.toThrow("OFFICE_IMAGE_INVALID");
      expect(config.storage.put).not.toHaveBeenCalled();
      expect(config.writes).not.toHaveBeenCalled();
    });
  }
});

test.each([0, 50])(
  "KOL replay retains %s signup Marks and projects private fields without writes",
  async (welcomeMarks) => {
    process.env.OFFICE_WRITES_ENABLED = "true";
    const config = fixture([
      {
        createdAt: new Date(),
        result: {
          ok: true,
          dryRun: false,
          id: "campaign",
          result: {
            id: "campaign",
            code: "OFFICE26",
            welcomeMarks,
            activationAt: "2026-01-01",
            expiresAt: "2027-01-01",
            attributionWindowDays: 90,
            flatAmountIdr: 1000,
            percentBps: 0,
            pausedAt: null,
            retiredAt: null,
            partnerName: "Private Partner",
            bankAccountNumber: "0000123456789",
            notes: "Private notes",
          },
        },
      },
    ]);
    const result = await executeOfficeAction(
      "referrals.retireKolCampaign",
      envelope({ code: "OFFICE26" }),
      config,
    );
    expect(result).toMatchObject({
      ok: true,
      id: "campaign",
      result: { code: "OFFICE26", welcomeMarks, flatAmountIdr: 1000 },
    });
    for (const value of [
      "Private Partner",
      "0000123456789",
      "Private notes",
      "bankAccountNumber",
    ])
      expect(JSON.stringify(result)).not.toContain(value);
    expect(config.writes).not.toHaveBeenCalled();
  },
);
