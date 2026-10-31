import { describe, expect, test } from "bun:test";
import { ReferralError } from "../../modules/referral/referral.errors";
import {
  decodeKolCommissionCursor,
  encodeKolCommissionCursor,
} from "../../modules/referral/referral.pagination";

describe("KOL commission cursor", () => {
  test("round-trips the stable created-at and ID ordering", () => {
    const createdAt = "2026-10-23T01:02:03.004567Z";
    const cursor = encodeKolCommissionCursor(createdAt, "decision|01");
    expect(decodeKolCommissionCursor(cursor)).toEqual({
      createdAt,
      id: "decision|01",
    });
  });

  test.each([
    "bad",
    "2026-10-23T01:02:03.004Z|%",
    "2026-02-30T01:02:03.004567Z|decision-1",
    "2026-10-23T01:02:03.004567Z|%00bad",
    "0000-01-01T00:00:00.000000Z|decision-1",
  ])("rejects invalid cursor %s", (cursor) => {
    let error: unknown;
    try {
      decodeKolCommissionCursor(cursor);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ReferralError);
    expect(error).toMatchObject({ code: "REFERRAL_INVALID_CURSOR" });
  });
});
