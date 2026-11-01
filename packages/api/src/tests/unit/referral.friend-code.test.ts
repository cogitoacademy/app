import { describe, expect, test } from "bun:test";
import {
  allocateFriendReferralCode,
  friendReferralPrefix,
} from "../../modules/referral/referral.friend-code";
import { normalizeReferralCode } from "../../modules/referral/referral.policy";

describe("short FRIEND codes", () => {
  test("normalizes names, strips punctuation and preserves exactly three letters", () => {
    expect(friendReferralPrefix("  Éléonore O'Neil  ", "id")).toBe("ELE");
    expect(friendReferralPrefix("a-b c", "id")).toBe("ABC");
    const fallback = friendReferralPrefix("", "id");
    expect(fallback).toMatch(/^[A-Z]{3}$/);
    expect(friendReferralPrefix("李明 123 😀", "id")).toBe(fallback);
    expect(friendReferralPrefix("A", "id")).toBe(`A${fallback.slice(0, 2)}`);
    expect(friendReferralPrefix("Ab", "id")).toBe(`AB${fallback[0]}`);
  });

  test("keeps leading zeros and old mixed-case input acceptance", async () => {
    expect(
      await allocateFriendReferralCode(
        "AND",
        new Set(),
        async (code) => code,
        0,
      ),
    ).toBe("AND000");
    expect(normalizeReferralCode(" and000 ")).toBe("AND000");
    expect(normalizeReferralCode(" f1234567890abcdef ")).toBe(
      "F1234567890ABCDEF",
    );
  });

  test("skips shared namespace occupants and retries racing insert collisions", async () => {
    const attempted: string[] = [];
    const code = await allocateFriendReferralCode(
      "AND",
      new Set(["AND999", "AND000"]),
      async (candidate) => {
        attempted.push(candidate);
        return candidate === "AND001" ? undefined : candidate;
      },
      999,
    );
    expect(attempted).toEqual(["AND001", "AND002"]);
    expect(code).toBe("AND002");
  });

  test("returns a concurrent owner's existing code without rotating it", async () => {
    expect(
      await allocateFriendReferralCode(
        "AND",
        new Set(),
        async () => "F1234567890ABCDEF",
        0,
      ),
    ).toBe("F1234567890ABCDEF");
  });

  test("finds the last free suffix without probabilistic exhaustion", async () => {
    const occupied = new Set(
      Array.from({ length: 999 }, (_, i) => `AND${String(i).padStart(3, "0")}`),
    );
    let inserts = 0;
    expect(
      await allocateFriendReferralCode(
        "AND",
        occupied,
        async (code) => {
          inserts++;
          return code;
        },
        23,
      ),
    ).toBe("AND999");
    expect(inserts).toBe(1);
  });

  test("bounds exhausted-prefix work, including all candidates racing", async () => {
    const attempted = new Set<string>();
    await expect(
      allocateFriendReferralCode(
        "AND",
        new Set(),
        async (code) => {
          attempted.add(code);
          return undefined;
        },
        781,
      ),
    ).rejects.toMatchObject({ code: "REFERRAL_CODE_EXHAUSTED" });
    expect(attempted.size).toBe(1000);
    let inserts = 0;
    await expect(
      allocateFriendReferralCode("AND", attempted, async (code) => {
        inserts++;
        return code;
      }),
    ).rejects.toMatchObject({ code: "REFERRAL_CODE_EXHAUSTED" });
    expect(inserts).toBe(0);
  });

  test("does not swallow infrastructure errors as collisions", async () => {
    await expect(
      allocateFriendReferralCode("AND", new Set(), async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
