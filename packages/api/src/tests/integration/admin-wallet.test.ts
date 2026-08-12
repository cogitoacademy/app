import { describe, expect, test, beforeAll } from "bun:test";
import { db } from "@cogito-app/db";

import { services } from "../../services";
import {
  createTestClient,
  createTestContext,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

describe("Admin wallet and ledger views (G9)", () => {
  const ts = Date.now();
  const adminEmail = `g9.admin.${ts}@cogito.test`;
  const studentEmail = `g9.student.${ts}@cogito.test`;

  let adminClient: TestClient;
  let studentClient: TestClient;
  let studentId: string;
  let walletId: string;

  beforeAll(async () => {
    await resetDatabase();

    const adminRes = await signUpAndSignIn(adminEmail, "Test1234!", "G9 Admin");
    const adminCtx = await createTestContext(adminRes.cookie);
    await setUserRole(adminCtx.session!.user!.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "G9 Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user!.id;
    studentClient = createTestClient(studentCtx);

    const w = await services.wallet.getOrCreate(studentId);
    walletId = w.id;

    await services.wallet.credit(db, {
      walletId,
      amount: 100,
      eventKey: `g9.credit.${ts}`,
      actorType: "admin",
      reason: "G9 test credit",
    });
    await services.wallet.hold(db, {
      walletId,
      amount: 40,
      eventKey: `g9.hold.${ts}`,
      actorType: "system",
      reason: "G9 test hold",
      bookingId: "g9-booking-1",
    });
    await services.wallet.release(db, {
      walletId,
      amount: 10,
      eventKey: `g9.release.${ts}`,
      actorType: "system",
      reason: "G9 test release",
      bookingId: "g9-booking-1",
    });
  });

  test("admin getWallet returns balance, held, and available", async () => {
    const w = await adminClient.admin.getWallet({ userId: studentId });
    expect(w.id).toBe(walletId);
    expect(w.totalBalance).toBe(100);
    expect(w.heldBalance).toBe(30);
    expect(w.availableBalance).toBe(70);
  });

  test("admin getWallet for user without wallet returns not found", async () => {
    await expect(
      adminClient.admin.getWallet({ userId: "no-such-user" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("admin listLedgerEntries returns paginated entries for a wallet", async () => {
    const page1 = await adminClient.admin.listLedgerEntries({
      walletId,
      limit: 2,
    });
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await adminClient.admin.listLedgerEntries({
      walletId,
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.length).toBe(1);
    expect(page2.nextCursor).toBeNull();

    const seen = [...page1.items, ...page2.items].map((i) => i.id);
    expect(new Set(seen).size).toBe(3);
  });

  test("admin listLedgerEntries filters by entry type", async () => {
    const result = await adminClient.admin.listLedgerEntries({
      walletId,
      entryType: "hold",
    });
    expect(result.items.length).toBe(1);
    expect(result.items[0]!.entryType).toBe("hold");
    expect(result.items[0]!.amount).toBe(40);
  });

  test("admin listLedgerEntries filters by date range", async () => {
    const dateTo = new Date(Date.now() + 3600_000).toISOString();
    const result = await adminClient.admin.listLedgerEntries({
      walletId,
      dateFrom: new Date(Date.now() - 3600_000).toISOString(),
      dateTo,
    });
    expect(result.items.length).toBe(3);
  });

  test("admin listLedgerEntries by userId and bookingId filter", async () => {
    const result = await adminClient.admin.listLedgerEntries({
      userId: studentId,
      bookingId: "g9-booking-1",
    });
    expect(result.items.length).toBe(2);
    for (const item of result.items) {
      expect(item.bookingId).toBe("g9-booking-1");
    }
  });

  test("admin listLedgerEntries requires walletId or userId", async () => {
    await expect(adminClient.admin.listLedgerEntries({})).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    );
  });

  test("non-admin gets 403 on admin wallet endpoints", async () => {
    await expect(
      studentClient.admin.getWallet({ userId: studentId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      studentClient.admin.listLedgerEntries({ walletId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
