import { describe, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { MarkPackageNotFoundError } from "../../modules/admin-mark-package/admin-mark-package.errors";
import { createAdminMarkPackageHandler } from "../../modules/admin-mark-package/admin-mark-package.handler";

const context = {
  session: { user: { id: "admin-1" } },
} as any;

describe("admin mark package handler", () => {
  test("delegates list without requiring an input payload", async () => {
    const list = mock(async () => [{ id: "package-1" }]);
    const handler = createAdminMarkPackageHandler({ list } as any);

    await expect(handler.list({ context } as any) as any).resolves.toEqual([
      { id: "package-1" },
    ]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  test("passes the session admin id to create", async () => {
    const create = mock(async () => ({ id: "package-1" }));
    const handler = createAdminMarkPackageHandler({ create } as any);
    const input = {
      code: "starter",
      name: "Starter",
      marks: 50,
      priceIdr: 312_500,
      isActive: true,
    };

    await expect(
      handler.create({ context, input } as any) as any,
    ).resolves.toEqual({ id: "package-1" });
    expect(create).toHaveBeenCalledWith("admin-1", input);
  });

  test("passes the session admin id to update and setActive", async () => {
    const update = mock(async () => ({ id: "package-1", name: "Updated" }));
    const setActive = mock(async () => ({ id: "package-1", isActive: false }));
    const handler = createAdminMarkPackageHandler({ update, setActive } as any);
    const updateInput = {
      id: "package-1",
      name: "Updated",
      marks: 75,
      priceIdr: 450_000,
    };
    const activeInput = { id: "package-1", isActive: false };

    await expect(
      handler.update({ context, input: updateInput } as any) as any,
    ).resolves.toEqual({ id: "package-1", name: "Updated" });
    await expect(
      handler.setActive({ context, input: activeInput } as any) as any,
    ).resolves.toEqual({ id: "package-1", isActive: false });
    expect(update).toHaveBeenCalledWith("admin-1", updateInput);
    expect(setActive).toHaveBeenCalledWith("admin-1", activeInput);
  });

  test("maps domain failures to an ORPC error", async () => {
    const update = mock(async () => {
      throw new MarkPackageNotFoundError("missing");
    });
    const handler = createAdminMarkPackageHandler({ update } as any);

    await expect(
      handler.update({
        context,
        input: {
          id: "missing",
          name: "Name",
          marks: 10,
          priceIdr: 100,
        },
      } as any) as any,
    ).rejects.toBeInstanceOf(ORPCError);
  });
});
