/**
 * WebSocket upgrade authorization. The browser cannot set headers on a
 * `WebSocket`, so the shared access token rides in the `?access=` query param
 * (baked into the client bundle behind the Vercel password wall). An empty /
 * unset token disables the gate — used by local dev and the real-stack e2e
 * smoke, which connect without a token.
 */
export function isAuthorizedUpgrade(
  reqUrl: string | undefined,
  token: string | undefined,
): boolean {
  if (!token) return true;
  if (reqUrl === undefined) return false;
  const url = new URL(reqUrl, "http://localhost");
  return url.searchParams.get("access") === token;
}
