/** Refresh mutable user fields even when Better Auth reads its Redis session cache. */
export async function refreshSessionResponse(
  response: Response,
  refresh: (user: { id: string; emailVerified: boolean }) => Promise<void>,
): Promise<Response> {
  if (!response.ok) return response;
  const payload = (await response.clone().json()) as {
    user?: { id: string; emailVerified: boolean };
  } | null;
  if (!payload?.user?.id) return response;
  await refresh(payload.user);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "private, no-store");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers,
  });
}
