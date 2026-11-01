import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";
import {
  JARVIS_KEY_CHECK_WINDOW_MS,
  JARVIS_KEY_CHECKS_PER_HOUR,
} from "#/config/limits";

/** Provider key checks per caller. One instance serves the whole process, so
 * a reconnect does not reset a caller's allowance. */
export class OwnKeyCheckLimiter {
  readonly #limiter: RateLimiter = createRateLimiter(
    JARVIS_KEY_CHECKS_PER_HOUR,
    JARVIS_KEY_CHECK_WINDOW_MS,
  );

  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** Charges one check; false when the caller has used them all. */
  allow(identity: string): boolean {
    return this.#limiter.hit(identity, this.#now());
  }
}
