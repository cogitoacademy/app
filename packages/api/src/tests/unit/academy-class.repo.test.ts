import { expect, mock, test } from "bun:test";
import { createAcademyClassRepo } from "../../modules/academy-class/academy-class.repo";
import type { DbOrTx } from "../../lib/tx";

test("class room overlap lookup returns the conflicting session or explicit null", async () => {
  const repo = createAcademyClassRepo();
  const start = new Date("2040-01-01T10:00:00Z");
  const end = new Date("2040-01-01T11:00:00Z");
  for (const rows of [[], [{ id: "conflict" }]]) {
    const limit = mock(async () => rows);
    const chain = { innerJoin: () => chain, where: () => ({ limit }) };
    const conn = { select: () => ({ from: () => chain }) } as unknown as DbOrTx;
    expect(
      await repo.findRoomClassSessionOverlap(
        conn,
        "own-session",
        "room1",
        start,
        end,
      ),
    ).toEqual(rows[0] ?? null);
    expect(limit).toHaveBeenCalledWith(1);
  }
});

test("missing competition and empty tutor lists do not acquire reference locks", async () => {
  const repo = createAcademyClassRepo();
  const limit = mock(async () => []);
  const chain = { from: () => chain, where: () => ({ limit }) };
  const select = mock(() => chain);
  const conn = { select } as unknown as Parameters<
    typeof repo.getCompetitionForPublish
  >[0];
  expect(await repo.getTutorProfiles(conn, [])).toEqual([]);
  expect(select).not.toHaveBeenCalled();
  expect(await repo.getCompetitionForPublish(conn, "deleted")).toBeNull();
  expect(limit).toHaveBeenCalledWith(1);
});

test("due meeting lookup applies its default batch limit", async () => {
  const repo = createAcademyClassRepo();
  const limit = mock(async () => []);
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => ({ limit }),
  };
  const conn = { select: () => chain } as unknown as DbOrTx;
  expect(await repo.listReadyMeetingIds(conn, new Date(), new Date())).toEqual(
    [],
  );
  expect(limit).toHaveBeenCalledWith(50);
});

test.each(["create", "cancel"] as const)(
  "lost meeting lease handles %s without inventing a saved result",
  async (operation) => {
    const repo = createAcademyClassRepo();
    const returning = mock(async () => []);
    const set = mock((_values: unknown) => ({ where: () => ({ returning }) }));
    const conn = { update: () => ({ set }) } as unknown as DbOrTx;
    expect(
      await repo.finishMeetingAttempt(
        conn,
        "meeting1",
        {
          provider: "google_meet",
          status: "failed",
          externalEventId: null,
          meetingUrl: null,
          errorReason: "Provider unavailable",
          nextRetryAt: new Date(),
          scheduleVersion: 1,
        },
        { lockedAt: new Date(), attemptCount: 1, operation },
      ),
    ).toBeNull();
    expect(set).toHaveBeenCalledTimes(operation === "cancel" ? 1 : 2);
    if (operation === "create")
      expect(set.mock.calls[1]?.[0]).toMatchObject({
        status: "pending",
        errorReason: "Provider write completed after the meeting lease changed",
      });
  },
);
