import { describe, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/server";

import { StudentNotFoundError } from "../../modules/admin-knowledge-bank/admin-knowledge-bank.errors";
import { createAdminKnowledgeBankHandler } from "../../modules/admin-knowledge-bank/admin-knowledge-bank.handler";

const context = {
  session: { user: { id: "admin-1" } },
} as any;

describe("admin Knowledge Bank access handler", () => {
  test("delegates list", async () => {
    const list = mock(async () => [{ id: "grant-1" }]);
    const handler = createAdminKnowledgeBankHandler({ list } as any);
    const input = { status: "active" };

    await expect(
      handler.list({ context, input } as any) as any,
    ).resolves.toEqual([{ id: "grant-1" }]);
    expect(list).toHaveBeenCalledWith(input);
  });

  test("passes the session admin id to create, update, and remove", async () => {
    const create = mock(async () => ({ id: "grant-1" }));
    const update = mock(async () => ({ id: "grant-1" }));
    const remove = mock(async () => null);
    const handler = createAdminKnowledgeBankHandler({
      create,
      update,
      remove,
    } as any);
    const createInput = {
      email: "student@example.com",
      expiresAt: "2099-01-02T03:04:05.000Z",
    };
    const updateInput = {
      id: "grant-1",
      expiresAt: "2099-02-02T03:04:05.000Z",
    };

    await expect(
      handler.create({ context, input: createInput } as any) as any,
    ).resolves.toEqual({
      id: "grant-1",
    });
    await expect(
      handler.update({ context, input: updateInput } as any) as any,
    ).resolves.toEqual({
      id: "grant-1",
    });
    await expect(
      handler.remove({ context, input: { id: "grant-1" } } as any) as any,
    ).resolves.toBeNull();
    expect(create).toHaveBeenCalledWith("admin-1", createInput);
    expect(update).toHaveBeenCalledWith("admin-1", updateInput);
    expect(remove).toHaveBeenCalledWith("admin-1", "grant-1");
  });

  test("maps domain failures to ORPC errors", async () => {
    const create = mock(async () => {
      throw new StudentNotFoundError("missing@example.com");
    });
    const handler = createAdminKnowledgeBankHandler({ create } as any);

    await expect(
      handler.create({
        context,
        input: {
          email: "missing@example.com",
          expiresAt: "2099-01-02T03:04:05.000Z",
        },
      } as any) as any,
    ).rejects.toBeInstanceOf(ORPCError);
  });
});
