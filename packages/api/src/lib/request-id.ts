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
