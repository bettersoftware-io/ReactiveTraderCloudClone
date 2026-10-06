import type { CoverTimings } from "./coreHost";

/** What decides how a core swap's cover moves, read when the swap starts. */
export interface MotionSettings {
  /** `navigator.webdriver`: an automated browser (the e2e suites). */
  readonly webdriver: boolean;
  /** The user's `prefers-reduced-motion: reduce`. */
  readonly reducedMotion: boolean;
  /** The power-saver level is `freeze`. */
  readonly freeze: boolean;
}

/** The fade in, the least time the cover stays up once it is opaque, and the
 * fade out (spec 2026-10-05-core-hot-swap-design.md §4). The overlay's CSS
 * takes its two transition durations from these same numbers. */
const COVER: CoverTimings = { enterMs: 160, holdMs: 500, exitMs: 200 };

/**
 * Chooses one swap's cover timings. One copy, shared by
 * both web clients.
 *
 * Under reduced motion or power-saver freeze the two fades are jump cuts and
 * the hold stays: the cover still shows long enough to be read, it just does
 * not move. Under webdriver nothing waits at all, so a test never spends
 * real time on a swap.
 *
 * The overlay's fades take their durations from this answer rather than
 * from the stylesheet's freeze rule alone, because that rule cannot be
 * relied on in the middle of a swap: `client-solid`'s `PowerSaverRoot`
 * removes `data-power-saver` from `<html>` while its tree is unmounted.
 */
export function chooseCoverTimings(motion: MotionSettings): CoverTimings {
  if (motion.webdriver) {
    return { enterMs: 0, holdMs: 0, exitMs: 0 };
  }

  if (motion.reducedMotion || motion.freeze) {
    return { enterMs: 0, holdMs: COVER.holdMs, exitMs: 0 };
  }

  return COVER;
}
