import type { IncomingHttpHeaders } from "node:http";

/**
 * S3 — the header the PLATFORM sets with the caller's address. Fly sets
 * `Fly-Client-IP`; `RTC_TRUSTED_IP_HEADER` overrides it for another proxy
 * (Cloudflare's `cf-connecting-ip`). Header names compare lower-cased, as
 * Node exposes them. `X-Forwarded-For` is never read: its first hop is
 * caller-supplied.
 */
export const TRUSTED_IP_HEADER_DEFAULT = "fly-client-ip";

export interface ClientIpSource {
  readonly headers: IncomingHttpHeaders;
  readonly socket: { readonly remoteAddress?: string };
}

/**
 * S3 — the rate limiter, the ban list and the connection caps all key on
 * this. Only the header the PLATFORM sets is trusted (`Fly-Client-IP`;
 * Cloudflare's `CF-Connecting-IP` via `RTC_TRUSTED_IP_HEADER` once that
 * layer exists). `X-Forwarded-For` is never read: its first entry is
 * whatever the caller put there.
 */
export function resolveClientIp(
  req: ClientIpSource,
  trustedHeader: string,
): string {
  const raw = req.headers[trustedHeader];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();

  if (trimmed) {
    return trimmed;
  }

  return req.socket.remoteAddress ?? "unknown";
}

/** `RTC_TRUSTED_IP_HEADER` (lower-cased) or `TRUSTED_IP_HEADER_DEFAULT`. */
export function resolveTrustedIpHeader(env: NodeJS.ProcessEnv): string {
  const override = env.RTC_TRUSTED_IP_HEADER?.trim().toLowerCase();

  return override ? override : TRUSTED_IP_HEADER_DEFAULT;
}
