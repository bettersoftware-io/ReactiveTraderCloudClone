/**
 * The single instant every fake fixture derives its timestamps from.
 *
 * **Noon, and UTC, deliberately.** Several fixtures render a date derived
 * through `toISOString()` — the blotter's trade/value dates most visibly. Noon
 * UTC yields the same ISO date everywhere from UTC-11 to UTC+12, where a
 * local-morning base would slide a day for a capture run far enough east. This
 * mirrors the constant it replaces (`VisualScenarioHost`'s
 * `BLOTTER_SEED_BASE_MS`), which was introduced when the blotter golden was
 * found re-dating itself every calendar day (T32) — and passing anyway, since
 * five short date strings are ~0.1% of the frame against a 6% tolerance.
 *
 * `Date.UTC` is a pure function of its arguments, not a clock read, so it is
 * deliberately outside the `Date.now|Math.random|setInterval|setTimeout` guard
 * that `buildFakeViewModel.test.tsx` enforces over this directory.
 *
 * NOT `fixtures.tsx`'s `PINNED_WALL_CLOCK`, which is local-time on purpose:
 * that one feeds `boot/topo`, which *renders* a wall-clock stamp and must be
 * pinned in the timezone the pixels are captured in. Same word, opposite
 * construction.
 */
export const PINNED_NOW_MS: number = Date.UTC(2026, 6, 27, 12, 0, 0);

/** One minute, in ms — for fixtures that space a series of timestamps. */
export const MINUTE_MS = 60_000;

/** One day, in ms — for fixtures that space trade or candle dates. */
export const DAY_MS = 86_400_000;
