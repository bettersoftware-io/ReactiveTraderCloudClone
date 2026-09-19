// Property-based tests (fast-check) for motion-core's chart math.
//
// An example-based test says "for THIS input, expect THAT output". A property
// says "for EVERY input, this must hold" — fast-check then generates hundreds
// of inputs hunting for a counter-example, and when it finds one it SHRINKS it
// to the smallest failing case before reporting. It is fuzzing with an oracle.
//
// Why here: this package is pure, total, numeric code whose doc comments
// already state properties in prose ("Exact inverse of priceToY", "keeps the
// math total"). Those sentences are claims nothing was checking. It is also
// what OpenSSF Scorecard's `Fuzzing` check recognises for JS/TS — see
// docs/security-scorecard.md.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type ChartScale,
  priceToY,
  Y_SPAN,
  Y_TOP,
  yToPrice,
} from "#/chartScene.js";
import {
  type ChartViewport,
  clampViewport,
  MIN_VIEWPORT_SPAN,
} from "#/chartViewport.js";

describe("clampViewport (properties)", () => {
  it("is idempotent — clamping a clamped viewport changes nothing", () => {
    fc.assert(
      fc.property(viewportArbitrary, seriesLenArbitrary, (vp, seriesLen) => {
        const once = clampViewport(vp, seriesLen);

        expect(clampViewport(once, seriesLen)).toEqual(once);
      }),
    );
  });

  it("always lands inside the series", () => {
    fc.assert(
      fc.property(viewportArbitrary, seriesLenArbitrary, (vp, seriesLen) => {
        const { start, end } = clampViewport(vp, seriesLen);

        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(seriesLen);
      }),
    );
  });

  it("never zooms in past the floor, unless the series itself is shorter", () => {
    fc.assert(
      fc.property(viewportArbitrary, seriesLenArbitrary, (vp, seriesLen) => {
        const { start, end } = clampViewport(vp, seriesLen);

        expect(end - start).toBe(
          Math.min(Math.max(vp.end - vp.start, MIN_VIEWPORT_SPAN), seriesLen),
        );
      }),
    );
  });
});

describe("priceToY / yToPrice (properties)", () => {
  it("maps the scale's own bounds onto the plot box edges, inverted", () => {
    fc.assert(
      fc.property(scaleArbitrary, (scale) => {
        expect(priceToY(scale, scale.cmax)).toBeCloseTo(Y_TOP, 6);
        expect(priceToY(scale, scale.cmin)).toBeCloseTo(Y_TOP + Y_SPAN, 6);
      }),
    );
  });

  it("is strictly decreasing in price — a higher price is always drawn higher", () => {
    fc.assert(
      fc.property(scaleWithTwoPricesArbitrary, ([scale, a, b]) => {
        // Not `a !== b`: two prices one float apart legitimately map to the
        // SAME y, so "strictly" is false at float resolution — fast-check
        // found exactly that (…377 vs …379) and this property was flaky until
        // it asked for a gap a chart could actually render.
        fc.pre(relativeError(a, b) > 1e-6);

        const [lower, higher] = a < b ? [a, b] : [b, a];

        // Inverted axis: y grows DOWNWARD, so the higher price has the smaller y.
        expect(priceToY(scale, higher)).toBeLessThan(priceToY(scale, lower));
      }),
    );
  });

  it("yToPrice maps the plot box edges back onto the scale's bounds", () => {
    fc.assert(
      fc.property(scaleArbitrary, (scale) => {
        expect(relativeError(yToPrice(scale, Y_TOP), scale.cmax)).toBeLessThan(
          1e-9,
        );
        expect(
          relativeError(yToPrice(scale, Y_TOP + Y_SPAN), scale.cmin),
        ).toBeLessThan(1e-9);
      }),
    );
  });

  // TODO(you): the round-trip property. `yToPrice`'s doc comment claims it is
  // the "Exact inverse of priceToY — same branch rules", and the crosshair
  // depends on that: it turns a pointer y back into the price it labels. Write
  // the property that holds that claim to account, for every scale mode.
  //
  // Everything you need is already in this file:
  //   - `scaleArbitrary`      → a valid ChartScale in linear, log or percent mode
  //   - `priceWithin(scale)`  → an arbitrary price inside [cmin, cmax]
  //   - `relativeError(a, b)` → |a − b| / |b|, if you decide tolerance is relative
  //   - `scaleWithTwoPricesArbitrary` shows the `.chain(...)` shape to copy
  //   - use `fc.assert(fc.property(arb, (value) => { …expect… }))`, and
  //     `arb.chain(...)` when one arbitrary depends on another's value.
  //
  // The decisions that are genuinely yours (they shape what this test MEANS):
  //   1. Tolerance. These are floats through log10/pow — exact equality will
  //      fail. Absolute (`toBeCloseTo(p, n)`) or RELATIVE to the price
  //      (|a−b| / p)? A 0.0001 error matters at 1.08 (EURUSD) and is noise at
  //      40,000 (an index) — which one does a trader's crosshair care about?
  //   2. Direction. price → y → price, y → price → y, or both? They are not
  //      equally strict, and only one of them is what the crosshair does.
  //   3. Domain. Only prices inside [cmin, cmax], or outside too (a candle
  //      wick can overshoot the visible range)?
  it.todo("yToPrice inverts priceToY in every scale mode");
});

// ── arbitraries ─────────────────────────────────────────────────────────────

/** Bars are whole candles; a viewport may be negative or overshoot the series
 * (that is exactly what a pan or a zoom produces before it is clamped). */
const viewportArbitrary: fc.Arbitrary<ChartViewport> = fc
  .tuple(
    fc.integer({ min: -500, max: 5000 }),
    fc.integer({ min: 0, max: 5000 }),
  )
  .map(([start, span]) => {
    return { start, end: start + span };
  });

const seriesLenArbitrary = fc.integer({ min: 0, max: 5000 });

/** Realistic instrument prices: from a sub-unit FX rate to a five-figure index.
 * `noNaN` + finite bounds keep the generator inside the domain the functions
 * document — totality on garbage input is a different property. */
const priceArbitrary = fc.double({
  min: 0.0001,
  max: 100_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** A valid scale: cmax strictly above cmin (a zero range takes the documented
 * `|| 1` fallback, which is not invertible by design), in one of the three
 * modes. Percent mode always carries a positive `base`, mirroring the
 * production invariant that percent-without-a-base is unrepresentable.
 *
 * `base` is generated NEAR the range (cmin × [0.5, 2]), not independently, and
 * that is a modelling decision fast-check forced: with an unconstrained base it
 * found `{cmin: 0.0001, base: 4492}`, where `price / base ≈ 2e-8` and the
 * `− 1` in `pctOf` cancels ~8 significant digits (catastrophic cancellation),
 * pushing the edge round-trip just past 1e-9 relative error. Production cannot
 * reach that: `base` is always a price taken from the series being drawn. So
 * the precision loss is real but out of domain — worth knowing, not a bug. */
const scaleArbitrary: fc.Arbitrary<ChartScale> = fc
  .tuple(
    priceArbitrary,
    fc.double({ min: 1.001, max: 3, noNaN: true }),
    fc.constantFrom<"linear" | "log" | "percent">("linear", "log", "percent"),
    fc.double({ min: 0.5, max: 2, noNaN: true }),
  )
  .map(([cmin, ratio, mode, baseFactor]) => {
    const bounds = { cmin, cmax: cmin * ratio };

    if (mode === "linear") {
      return bounds;
    }

    return mode === "log"
      ? { ...bounds, yScale: mode }
      : { ...bounds, yScale: mode, base: cmin * baseFactor };
  });

/** An arbitrary price inside the scale's visible range. */
function priceWithin(scale: ChartScale): fc.Arbitrary<number> {
  return fc.double({ min: scale.cmin, max: scale.cmax, noNaN: true });
}

/** A scale plus two prices inside it. `chain` is how one arbitrary depends on
 * another's generated value — the prices' bounds come FROM the scale. */
const scaleWithTwoPricesArbitrary = scaleArbitrary.chain((scale) => {
  return fc.tuple(fc.constant(scale), priceWithin(scale), priceWithin(scale));
});

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}
