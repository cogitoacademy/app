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
