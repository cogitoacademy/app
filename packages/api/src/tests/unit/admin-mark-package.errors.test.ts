import { describe, expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  MarkPackageCodeConflictError,
  MarkPackageNotFoundError,
  mapAdminMarkPackageError,
} from "../../modules/admin-mark-package/admin-mark-package.errors";

class UnknownMarkPackageError extends DomainError {
  readonly domain = "admin-mark-package";
}

describe("admin mark package errors", () => {
  test("exposes not-found details as a domain error", () => {
    const error = new MarkPackageNotFoundError("package-1");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.domain).toBe("admin-mark-package");
    expect(error.code).toBe("MARK_PACKAGE_NOT_FOUND");
    expect(error.details).toEqual({ id: "package-1" });
  });

  test("exposes duplicate-code details as a domain error", () => {
    const error = new MarkPackageCodeConflictError("starter");

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("MARK_PACKAGE_CODE_CONFLICT");
    expect(error.details).toEqual({ code: "starter" });
  });

  test("maps known errors to HTTP status codes", () => {
    expect(
      mapAdminMarkPackageError(new MarkPackageNotFoundError("p1")).status,
    ).toBe(404);
    expect(
      mapAdminMarkPackageError(new MarkPackageCodeConflictError("starter"))
        .status,
    ).toBe(409);
    expect(
      mapAdminMarkPackageError(
        new UnknownMarkPackageError("UNKNOWN", "unknown", {}),
      ).status,
    ).toBe(500);
  });
});
