/**
 * Build the WebSocket URL the client connects with. When a session token is
 * available (from a successful `/login`), it rides in the `?access=` query
 * param — the only browser-compatible way to pass it, since the WebSocket API
 * forbids custom headers. No token → the bare URL (local dev / simulator-less
 * builds, or before login completes).
 */
export function buildWsUrl(url: string, token: string | undefined): string {
  if (!token) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("access", token);
  return parsed.toString();
}
