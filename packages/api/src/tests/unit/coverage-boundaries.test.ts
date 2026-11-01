import { createAdminBookingHandler } from "../../modules/admin-booking/admin-booking.handler";
import type { Context } from "../../context";
import { expect, test, mock } from "bun:test";
import { createEmailModule } from "../../modules/email";
import { createPricingModule } from "../../modules/pricing";
import { createResendEmailProvider } from "../../modules/email/resend-email.provider";
import { createContactRepo } from "../../modules/contact/contact.repo";
import { createInviteRepo } from "../../modules/invite/invite.repo";
import { createAchievementRepo } from "../../modules/achievement/achievement.repo";
import { sumLedgerAmount } from "../../modules/wallet/wallet.repo";
import type { DbOrTx } from "../../lib/tx";

function emptyConnection() {
  const chain = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    set: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    returning: async () => [],
    // eslint-disable-next-line unicorn/no-thenable -- Drizzle builders are PromiseLike.
    then: (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve([]).then(resolve),
  };
  return {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
  } as unknown as DbOrTx;
}

test("module factories support Resend selection and default pricing", async () => {
  expect(
    createEmailModule({
      resendApiKey: "test-only",
      emailFrom: "test@example.test",
    }).service,
  ).toBeDefined();
  expect(await createPricingModule().service.getActiveV3Config()).toBeNull();
});

test("contact write conflicts and deleted invitation users return explicit absence", async () => {
  const conn = emptyConnection();
  expect(await createInviteRepo().getUserRoleById(conn, "deleted")).toBeNull();
  expect(
    await createContactRepo().insertRequest(conn, {
      bookingId: "b1",
      requesterId: "u1",
      recipientId: "u2",
      message: null,
    }),
  ).toBeNull();
  expect(
    await createContactRepo().respondToRequest(conn, "r1", "u2", "accepted"),
  ).toBeNull();
  expect(await sumLedgerAmount(conn, "w1", ["credit"])).toBe(0);
});

test("admin review supports pending records in the deleted queue", async () => {
  expect(
    await createAchievementRepo().adminList(emptyConnection(), {
      limit: 10,
      offset: 0,
      status: "pending",
      deleted: true,
    }),
  ).toEqual([]);
});

test("Resend sends a stable idempotency key and propagates falsy transport failures", async () => {
  const original = globalThis.fetch;
  const fetchMock = mock(
    async (_input: unknown, _init?: RequestInit) =>
      new Response('{"id":"email1"}', { status: 200 }),
  );
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    const provider = createResendEmailProvider(
      "test-key",
      "sender@example.test",
    );
    const message = {
      to: "recipient@example.test",
      subject: "Test",
      html: "Hello",
      category: "booking",
      idempotencyKey: "stable1",
    };
    expect(await provider.send(message)).toEqual({ messageId: "email1" });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "dispatch-stable1",
    });
    globalThis.fetch = (async () => {
      throw null;
    }) as typeof fetch;
    await expect(provider.send(message)).rejects.toBeNull();
  } finally {
    globalThis.fetch = original;
  }
});

test("admin meeting retry forwards the authenticated actor and booking", async () => {
  const retryMeeting = mock(async (_actorId: string, bookingId: string) => ({
    bookingId,
    scheduled: true,
  }));
  const handler = createAdminBookingHandler({
    retryMeeting,
  } as unknown as Parameters<typeof createAdminBookingHandler>[0]);
  const result = await handler.retryMeeting({
    context: { session: { user: { id: "admin1" } } } as Context,
    input: { bookingId: "booking1" },
  });
  expect(result).toEqual({ bookingId: "booking1", scheduled: true });
  expect(retryMeeting).toHaveBeenCalledWith("admin1", "booking1");
});
