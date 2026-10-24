import { createHash, randomInt } from "node:crypto";
import { ReferralError } from "./referral.errors";

export function friendReferralPrefix(name: string, userId: string) {
  const letters = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  const identity = [
    ...createHash("sha256").update(userId).digest().subarray(0, 3),
  ]
    .map((byte) => String.fromCharCode(65 + (byte % 26)))
    .join("");
  return (letters + identity).slice(0, 3);
}

/** The insert callback returns the saved code, including a concurrent owner's winner. */
export async function allocateFriendReferralCode(
  prefix: string,
  occupied: ReadonlySet<string>,
  tryInsert: (code: string) => Promise<string | undefined>,
  start = randomInt(1000),
) {
  for (let offset = 0; offset < 1000; offset++) {
    const code = `${prefix}${String((start + offset) % 1000).padStart(3, "0")}`;
    if (occupied.has(code)) continue;
    // Each candidate is attempted once; unique constraints arbitrate concurrent writers.
    // eslint-disable-next-line no-await-in-loop
    const saved = await tryInsert(code);
    if (saved) return saved;
  }
  throw new ReferralError(
    "REFERRAL_CODE_EXHAUSTED",
    "All 1,000 referral codes for this identity prefix are taken. Contact support.",
  );
}
