import {
  createRateLimiter,
  type RateLimiter,
  type RefundableRateLimiter,
} from "#/auth/rateLimit";
import {
  JARVIS_KEY_CHECK_WINDOW_MS,
  JARVIS_KEY_CHECKS_HARD_PER_HOUR,
  JARVIS_KEY_CHECKS_PER_HOUR,
} from "#/config/limits";

/** Provider key checks per caller. One instance serves the whole process, so
 * a reconnect does not reset a caller's allowance. Two limits, and a check
 * must pass both:
 *
 * - `#guesses` bounds guessing. A check the provider accepts is refunded,
 *   because a good key reconnecting (two tabs on a flapping laptop) is not a
 *   guess.
 * - `#calls` bounds calls to the provider. Nothing is refunded here: without
 *   it, two good keys sent in turn would be refunded every time, and the
 *   server would call the provider as fast as the socket's token bucket
 *   allows. */
export class OwnKeyCheckLimiter {
  readonly #guesses: RefundableRateLimiter = createRateLimiter(
    JARVIS_KEY_CHECKS_PER_HOUR,
    JARVIS_KEY_CHECK_WINDOW_MS,
  );

  readonly #calls: RateLimiter = createRateLimiter(
    JARVIS_KEY_CHECKS_HARD_PER_HOUR,
    JARVIS_KEY_CHECK_WINDOW_MS,
  );

  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** Charges one check to both limits; false, charging neither, when the
   * caller is over either. */
  allow(identity: string): boolean {
    const now = this.#now();

    if (
      !this.#guesses.peek(identity, now) ||
      !this.#calls.peek(identity, now)
    ) {
      return false;
    }

    this.#guesses.hit(identity, now);
    this.#calls.hit(identity, now);

    return true;
  }

  /** Gives back the guess a check that came back accepted was charged. It
   * still counts as a call. */
  refund(identity: string): void {
    this.#guesses.refund(identity);
  }
}
