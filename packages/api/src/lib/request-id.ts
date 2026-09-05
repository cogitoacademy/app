import { isProductionLike } from "@cogito-app/env/node-env";

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function getClientIp(
  request: Request,
  trustProxy: boolean,
  server?: { requestIP(request: Request): { address: string } | null },
): string {
  if (trustProxy) {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      server?.requestIP(request)?.address ??
      "unknown"
    );
  }
  // Client-controlled headers (x-real-ip, x-forwarded-for) are never trusted
  // unless TRUST_PROXY is set; fall back to the socket address instead.
  return server?.requestIP(request)?.address ?? "unknown";
}

export function isValidUploadKey(key: string): boolean {
  return !!key && !key.includes("..") && !key.startsWith("/");
}

export async function readBodyWithLimit(
  request: Request,
  limit: number,
): Promise<{ body: string; tooLarge: boolean }> {
  const { bytes, tooLarge } = await readBodyBytesWithLimit(request, limit);
  if (tooLarge) return { body: "", tooLarge: true };
  return { body: Buffer.from(bytes).toString("utf-8"), tooLarge: false };
}

export async function readBodyBytesWithLimit(
  request: Request,
  limit: number,
): Promise<{ bytes: Uint8Array; tooLarge: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(0), tooLarge: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > limit) {
        // eslint-disable-next-line no-await-in-loop
        await reader.cancel();
        return { bytes: new Uint8Array(0), tooLarge: true };
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, tooLarge: false };
}

export type SniffedImageKind = "png" | "jpeg" | "webp" | "gif";

/**
 * Magic-byte sniff for image uploads (U2). Returns the detected image kind,
 * or null when the bytes are not a recognized image (polyglot/HTML/PDF).
 * Lenient by design: callers accept any recognized image kind regardless of
 * the declared content type or key extension — PNG bytes uploaded against a
 * `.jpg` key are fine; HTML bytes against a `.png` key are rejected.
 */
export function sniffImageKind(bytes: Uint8Array): SniffedImageKind | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function openApiAccessDenied(
  nodeEnv: string,
  hasSession: boolean,
): Response | null {
  if (isProductionLike(nodeEnv))
    return new Response("Not Found", { status: 404 });
  if (!hasSession) return new Response("Unauthorized", { status: 401 });
  return null;
}
