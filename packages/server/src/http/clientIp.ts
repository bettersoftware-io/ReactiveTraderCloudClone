import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

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
 * whatever the caller put there. An IPv6 caller is keyed by its /64
 * (`collapseToNetworkKey`): one subscriber is routed a whole /64, so keying
 * on the full address would give anyone unlimited keys.
 */
export function resolveClientIp(
  req: ClientIpSource,
  trustedHeader: string,
): string {
  const raw = req.headers[trustedHeader];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();

  if (trimmed) {
    return collapseToNetworkKey(trimmed);
  }

  const remote = req.socket.remoteAddress;

  return remote === undefined ? "unknown" : collapseToNetworkKey(remote);
}

/**
 * The key every per-IP bound uses for one caller. An IPv4 address is itself;
 * an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) is the IPv4 address; any
 * other IPv6 address is its /64 network, spelled one way — the first four
 * hextets, lower-case, without leading zeros, then `::` — so the key is
 * itself a valid IPv6 address (it is also what Supabase is told). A zone id
 * (`%eth0`) is dropped. Anything that does not parse is returned unchanged.
 */
export function collapseToNetworkKey(address: string): string {
  if (isIP(address) === 4) {
    return address;
  }

  const hextets = parseIpv6Hextets(address.replace(/%.*$/, ""));

  if (hextets === null) {
    return address;
  }

  if (isIpv4Mapped(hextets)) {
    return formatIpv4(hextets[6] ?? 0, hextets[7] ?? 0);
  }

  return `${hextets
    .slice(0, 4)
    .map((hextet) => {
      return hextet.toString(16);
    })
    .join(":")}::`;
}

/**
 * The /48 that holds an IPv6 key — the first three hextets, then `::` — so a
 * caller routed a whole /48 (a free tunnel broker hands out 65,536 /64s) can
 * be bounded as a group. `null` for an IPv4 caller, an IPv4-mapped address
 * and anything that does not parse: those have no wider bucket.
 */
export function widerNetworkKeyOf(key: string): string | null {
  if (isIP(key) !== 6) {
    return null;
  }

  const hextets = parseIpv6Hextets(key.replace(/%.*$/, ""));

  if (hextets === null || isIpv4Mapped(hextets)) {
    return null;
  }

  return `${hextets
    .slice(0, 3)
    .map((hextet) => {
      return hextet.toString(16);
    })
    .join(":")}::`;
}

/** `RTC_TRUSTED_IP_HEADER` (lower-cased) or `TRUSTED_IP_HEADER_DEFAULT`. */
export function resolveTrustedIpHeader(env: NodeJS.ProcessEnv): string {
  const override = env.RTC_TRUSTED_IP_HEADER?.trim().toLowerCase();

  return override ? override : TRUSTED_IP_HEADER_DEFAULT;
}

const IPV6_HEXTETS = 8;

/** The eight 16-bit groups of an IPv6 address, or null if it is not one. */
function parseIpv6Hextets(address: string): number[] | null {
  if (isIP(address) !== 6) {
    return null;
  }

  const halves = address.split("::");
  const head = splitHextets(halves[0] ?? "");
  const tail = halves.length > 1 ? splitHextets(halves[1] ?? "") : [];

  if (head === null || tail === null) {
    return null;
  }

  const missing = IPV6_HEXTETS - head.length - tail.length;

  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return null;
  }

  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** One side of a `::`: colon-separated hex groups, the last of which may be
 * a dotted IPv4 tail worth two groups. */
function splitHextets(part: string): number[] | null {
  if (part === "") {
    return [];
  }

  const hextets: number[] = [];

  for (const group of part.split(":")) {
    if (group.includes(".")) {
      const octets = group.split(".").map(Number);

      hextets.push(
        ((octets[0] ?? 0) << 8) | (octets[1] ?? 0),
        ((octets[2] ?? 0) << 8) | (octets[3] ?? 0),
      );
    } else {
      const value = Number.parseInt(group, 16);

      if (Number.isNaN(value)) {
        return null;
      }

      hextets.push(value);
    }
  }

  return hextets;
}

function isIpv4Mapped(hextets: readonly number[]): boolean {
  return (
    hextets.slice(0, 5).every((hextet) => {
      return hextet === 0;
    }) && hextets[5] === 0xffff
  );
}

function formatIpv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}
