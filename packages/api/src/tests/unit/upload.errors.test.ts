import { describe, expect, test } from "bun:test";

import {
  InvalidFilenameError,
  UnsupportedContentTypeError,
  mapUploadError,
} from "../../modules/upload/upload.errors";

describe("upload errors", () => {
  test("InvalidFilenameError maps to BAD_REQUEST", () => {
    const err = mapUploadError(new InvalidFilenameError("../x.png"));
    expect(err.code).toBe("BAD_REQUEST");
  });

  test("UnsupportedContentTypeError maps to BAD_REQUEST", () => {
    const err = mapUploadError(new UnsupportedContentTypeError("text/plain"));
    expect(err.code).toBe("BAD_REQUEST");
  });

  test("unknown DomainErrors map to INTERNAL_SERVER_ERROR", () => {
    const err = mapUploadError({
      code: "UNKNOWN",
      domain: "upload",
      message: "boom",
      name: "UnknownUploadError",
    } as never);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
