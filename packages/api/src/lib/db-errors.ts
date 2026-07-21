import { conflict, badRequest, internalServerError } from "./errors";

function getPostgresErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return null;
}

export function isUniqueViolation(err: unknown): boolean {
  return getPostgresErrorCode(err) === "23505";
}

export function isForeignKeyViolation(err: unknown): boolean {
  return getPostgresErrorCode(err) === "23503";
}

export function isCheckConstraintViolation(err: unknown): boolean {
  const code = getPostgresErrorCode(err);
  return code === "23514" || code === "23511";
}

export function classifyDbError(err: unknown, context?: string): never {
  const code = getPostgresErrorCode(err);
  const msg = context ? `${context}: ${String(err)}` : String(err);

  switch (code) {
    case "23505":
      throw conflict(msg, err);
    case "23503":
      throw badRequest(msg, err);
    case "23514":
    case "23511":
      throw badRequest(msg, err);
    default:
      throw internalServerError(msg, err);
  }
}
