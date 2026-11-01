import { describe, expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  FaqLandingLimitError,
  FaqNotFoundError,
  FaqVersionConflictError,
  mapFaqError,
} from "../../modules/faq/faq.errors";

describe("FAQ error mapping", () => {
  test("maps domain errors to the expected RPC status", () => {
    expect(mapFaqError(new FaqNotFoundError("faq-1")).code).toBe("NOT_FOUND");
    expect(mapFaqError(new FaqLandingLimitError()).code).toBe("BAD_REQUEST");
    expect(mapFaqError(new FaqVersionConflictError("faq-1", 1, 2)).code).toBe(
      "CONFLICT",
    );
    expect(mapFaqError(new DomainError("OTHER", "other")).code).toBe(
      "INTERNAL_SERVER_ERROR",
    );
  });
});
