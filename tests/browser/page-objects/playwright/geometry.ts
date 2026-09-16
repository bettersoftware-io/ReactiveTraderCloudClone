import type { Locator } from "@playwright/test";

/** An element's on-screen rectangle, as `Locator.boundingBox()` returns it. */
export type ElementBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** How long to keep re-sampling before giving up. Generous on purpose: the
 * cost of waiting is paid only when the element genuinely never lays out,
 * which is a real failure worth a clear message rather than a fast one. */
const DEFAULT_LAYOUT_TIMEOUT_MS = 5_000;

/** Gap between samples. Short enough that the common case (laid out on the
 * first or second look) costs nothing measurable. */
const SAMPLE_INTERVAL_MS = 50;

/**
 * Reads a locator's bounding box, re-sampling until the element actually has
 * one.
 *
 * `boundingBox()` is a SINGLE sample and answers `null` for an element that
 * is attached but has no box at that instant. Playwright's auto-waiting does
 * not cover this: a preceding `toBeVisible()` can pass and the very next
 * `boundingBox()` can still come back `null`, because the two calls sample
 * the page at different moments and this app re-renders continuously off a
 * live price stream. Reading once therefore converts a transient re-render
 * into a hard failure — `equitiesChart.spec.ts`'s trendline test failed
 * exactly this way 3 times in ~60 CI runs ("drawing not laid out"), passing
 * on every re-run.
 *
 * This is a retry-until-readable, NOT one of the fixed sleeps #404 removed:
 * it returns on the first successful sample, so a healthy run pays nothing,
 * and no duration here is being guessed against a random delay. Only a
 * genuinely unlaid-out element waits the full budget, and then fails with a
 * message that says so.
 */
export async function readBoxWhenLaidOut(
  locator: Locator,
  what: string,
  timeoutMs: number = DEFAULT_LAYOUT_TIMEOUT_MS,
): Promise<ElementBox> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;

  while (true) {
    const box = await locator.boundingBox();
    attempts += 1;

    if (box !== null) {
      return box;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `${what} not laid out — no bounding box after ${attempts} samples over ${timeoutMs}ms. ` +
          "The element is attached but has no on-screen rectangle, so it is genuinely unrendered " +
          "(zero-sized container, display:none ancestor, or never mounted) rather than mid-re-render.",
      );
    }

    await locator.page().waitForTimeout(SAMPLE_INTERVAL_MS);
  }
}
