export const MAX_BODY_BYTES = 1024 * 1024;
// 5 MiB PDF encoded as base64, plus bounded JSON metadata/envelope overhead.
export const MAX_PDF_UPLOAD_BODY_BYTES =
  4 * Math.ceil((5 * 1024 * 1024) / 3) + 16 * 1024;

export function requestBodyBudget(request: Request): number {
  const path = new URL(request.url).pathname;
  if (request.method === "POST" && path === "/rpc/adminContent/uploadPdf") {
    return MAX_PDF_UPLOAD_BODY_BYTES;
  }
  return path.startsWith("/webhooks/") ? 256 * 1024 : MAX_BODY_BYTES;
}
