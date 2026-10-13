import type { RateLimiter } from "../auth/rateLimit.js";
import { widerNetworkKeyOf } from "./clientIp.js";

/**
 * One per-IP budget in two tiers: the caller's own key (an IPv4 address or
 * an IPv6 /64) and, for IPv6, the /48 that holds it, against a limiter with a
 * larger budget. Both are always charged, so a /64 refused on its own window
 * still counts towards its /48; a refusal from either is a refusal. Satisfies
 * `RateLimiter`, so no handler knows it is there.
 */
export function createTieredLimiter(
  own: RateLimiter,
  wider: RateLimiter,
): RateLimiter {
  return {
    hit(key: string, now: number): boolean {
      const ownAllowed = own.hit(key, now);
      const widerKey = widerNetworkKeyOf(key);
      const widerAllowed = widerKey === null ? true : wider.hit(widerKey, now);

      return ownAllowed && widerAllowed;
    },
    peek(key: string, now: number): boolean {
      const widerKey = widerNetworkKeyOf(key);

      return (
        own.peek(key, now) && (widerKey === null || wider.peek(widerKey, now))
      );
    },
    size(): number {
      return own.size();
    },
  };
}
