import {
  createRateLimiter,
  type RefundableRateLimiter,
} from "#/auth/rateLimit";
import {
  JARVIS_KEY_CHECK_WINDOW_MS,
  JARVIS_KEY_CHECKS_PER_HOUR,
} from "#/config/limits";

/** Provider key checks per caller. One instance serves the whole process, so
 * a reconnect does not reset a caller's allowance. A check the provider
 * accepts is refunded: what the limit bounds is guessing, and a good key
 * reconnecting (two tabs on a flapping laptop) is not that. */
export class OwnKeyCheckLimiter {
  readonly #limiter: RefundableRateLimiter = createRateLimiter(
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

  /** Gives back the charge of a check that came back accepted. */
  refund(identity: string): void {
    this.#limiter.refund(identity);
  }
}
