import { ReferralError } from "./referral.errors";

const CURSOR_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/;

export function encodeKolCommissionCursor(createdAt: string, id: string) {
  return `${createdAt}|${encodeURIComponent(id)}`;
}

export function decodeKolCommissionCursor(cursor: string) {
  const separator = cursor.indexOf("|");
  if (separator <= 0 || separator === cursor.length - 1) {
    throw new ReferralError("REFERRAL_INVALID_CURSOR", "Invalid cursor.");
  }

  const timestamp = cursor.slice(0, separator);
  const timestampParts = CURSOR_TIMESTAMP_PATTERN.exec(timestamp);
  const createdAt = timestampParts
    ? new Date(`${timestampParts[1]}.${timestampParts[2]!.slice(0, 3)}Z`)
    : null;
  let id: string;
  try {
    id = decodeURIComponent(cursor.slice(separator + 1));
  } catch {
    throw new ReferralError("REFERRAL_INVALID_CURSOR", "Invalid cursor.");
  }

  if (
    !createdAt ||
    !Number.isFinite(createdAt.getTime()) ||
    timestampParts?.[1]?.startsWith("0000-") ||
    createdAt.toISOString().slice(0, 19) !== timestampParts?.[1] ||
    id.length === 0 ||
    id.length > 200 ||
    id.split("").some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new ReferralError("REFERRAL_INVALID_CURSOR", "Invalid cursor.");
  }

  return { createdAt: timestamp, id };
}
