export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

export function getClientIp(request: Request, trustProxy: boolean): string {
  if (trustProxy) {
    return (
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown"
    );
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function isValidUploadKey(key: string): boolean {
  return !!key && !key.includes("..") && !key.startsWith("/");
}

export async function readBodyWithLimit(
  request: Request,
  limit: number,
): Promise<{ body: string; tooLarge: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { body: "", tooLarge: false };
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
        return { body: "", tooLarge: true };
      }
      chunks.push(value);
    }
  }
  return { body: Buffer.concat(chunks).toString("utf-8"), tooLarge: false };
}

export function openApiAccessDenied(
  nodeEnv: string,
  hasSession: boolean,
): Response | null {
  if (nodeEnv === "production")
    return new Response("Not Found", { status: 404 });
  if (!hasSession) return new Response("Unauthorized", { status: 401 });
  return null;
}
