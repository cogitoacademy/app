import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { db } from "../../lib/db";
import {
  manualSignupSourceInput,
  setManualSignupSource,
} from "../../modules/admin/signup-source";
import { createAdminHandler } from "../../modules/admin/admin.handler";
import type { Context } from "../../context";
import type { AdminService } from "../../modules/admin/admin.service";

afterEach(() => mock.restore());
function fixture(source: unknown, failure?: "update" | "audit") {
  const writes: unknown[] = [];
  const audit = mock(async (value: unknown) => {
    if (failure === "audit") throw new Error("audit unavailable");
    writes.push(value);
  });
  const update = mock(async (value: unknown) => {
    if (failure === "update") throw new Error("update unavailable");
    writes.push(value);
  });
  const lock = mock(async () =>
    source === undefined ? [] : [{ signupSource: source }],
  );
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: lock }) }) }),
    update: () => ({
      set: (value: unknown) => ({ where: () => update(value) }),
    }),
    insert: () => ({ values: audit }),
  };
  const transaction = spyOn(db, "transaction").mockImplementation(
    async (fn: any) => fn(tx),
  );
  return { writes, audit, update, lock, transaction };
}
describe("manual signup attribution transaction", () => {
  test("validates the closed source vocabulary and required user id", () => {
    for (const source of ["whatsapp", "school", "event", "friend", "other"])
      expect(
        manualSignupSourceInput.parse({ userId: "student", source }).source,
      ).toBe(source);
    for (const input of [
      { userId: "", source: "friend" },
      { userId: "student", source: "instagram" },
      {},
    ])
      expect(manualSignupSourceInput.safeParse(input).success).toBe(false);
  });
  test("locks target, preserves attribution and records admin identity", async () => {
    const original = {
      first: { source: "instagram" },
      last: { source: "google" },
      manual: "other",
    };
    const f = fixture(original);
    const handler = createAdminHandler({} as AdminService);
    expect(
      await handler.setManualSignupSource({
        context: { session: { user: { id: "admin-actor" } } } as Context,
        input: { userId: "student", source: "school" },
      }),
    ).toEqual({ manual: "school" });
    expect(f.lock).toHaveBeenCalledWith("update");
    expect(f.writes).toEqual([
      { signupSource: { ...original, manual: "school" } },
      {
        actorId: "admin-actor",
        actorType: "admin",
        action: "signup_source.manual_updated",
        targetId: "student",
        targetType: "user",
        afterState: { manual: "school" },
      },
    ]);
    expect(original.manual).toBe("other");
  });
  test("supports accounts with no captured attribution", async () => {
    const f = fixture(null);
    await setManualSignupSource("admin", {
      userId: "student",
      source: "friend",
    });
    expect(f.writes[0]).toEqual({ signupSource: { manual: "friend" } });
  });
  test("missing user rejects before update and audit", async () => {
    const f = fixture(undefined);
    await expect(
      setManualSignupSource("admin", { userId: "missing", source: "other" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  for (const failure of ["update", "audit"] as const)
    test(`propagates ${failure} failure to transaction owner`, async () => {
      const f = fixture(null, failure);
      await expect(
        setManualSignupSource("admin", { userId: "student", source: "event" }),
      ).rejects.toThrow(`${failure} unavailable`);
      expect(f.transaction).toHaveBeenCalledTimes(1);
      if (failure === "update") expect(f.audit).not.toHaveBeenCalled();
    });
});
