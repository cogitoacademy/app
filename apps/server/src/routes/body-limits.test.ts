import { expect, test } from "bun:test";
import { readBodyWithLimit } from "@cogito-app/api/lib/request-id";
import {
  MAX_BODY_BYTES,
  MAX_PDF_UPLOAD_BODY_BYTES,
  requestBodyBudget,
} from "./body-limits";

test("5 MiB PDF envelope fits only the exact POST upload procedure", async () => {
  const body = JSON.stringify({
    json: {
      fileName: "report.pdf",
      base64: Buffer.alloc(5 * 1024 * 1024).toString("base64"),
    },
  });
  const request = new Request("http://localhost/rpc/adminContent/uploadPdf", {
    method: "POST",
    body,
  });
  expect(body.length).toBeLessThan(MAX_PDF_UPLOAD_BODY_BYTES);
  expect(
    (await readBodyWithLimit(request, requestBodyBudget(request))).tooLarge,
  ).toBe(false);
  for (const path of [
    "/rpc/adminContent/create",
    "/rpc/adminContent/uploadPdf/extra",
    "/rpc/auth/getProfile?next=/rpc/adminContent/uploadPdf",
  ]) {
    expect(
      requestBodyBudget(
        new Request(`http://localhost${path}`, { method: "POST" }),
      ),
    ).toBe(MAX_BODY_BYTES);
  }
  expect(
    requestBodyBudget(
      new Request("http://localhost/rpc/adminContent/uploadPdf"),
    ),
  ).toBe(MAX_BODY_BYTES);
});

test("upload remains bounded for chunked requests", async () => {
  const request = new Request("http://localhost/rpc/adminContent/uploadPdf", {
    method: "POST",
    body: "x".repeat(MAX_PDF_UPLOAD_BODY_BYTES + 1),
  });
  expect(
    (await readBodyWithLimit(request, requestBodyBudget(request))).tooLarge,
  ).toBe(true);
});
