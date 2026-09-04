import { describe, expect, mock, test } from "bun:test";
import { createWalletModule } from "../../modules/wallet";

function makeFakeDb(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  const chain: any = {
    from: mock(() => promise),
    where: mock(() => promise),
  };
  (promise as any).from = chain.from;
  (promise as any).where = chain.where;
  return { select: mock(() => promise) };
}

describe("wallet module", () => {
  test("composes repository, service, and handler", () => {
    const module = createWalletModule({ db: {} as any });

    expect(module.service).toBeDefined();
    expect(module.handler).toBeDefined();
    expect(module.service.listActivePackages).toBeFunction();
    expect(module.handler.listPackages).toBeFunction();
  });

  test("passes the Xendit mode through to the handler", async () => {
    const rows = [{ id: "pkg1", code: "starter", isActive: true }];
    const module = createWalletModule({
      db: makeFakeDb(rows) as any,
      xenditMode: "test",
    });

    const result = await module.handler.listPackages({
      context: { session: { user: { id: "u1" } } },
    } as any);

    expect(result).toEqual({ xenditMode: "test", packages: rows });
  });
});
