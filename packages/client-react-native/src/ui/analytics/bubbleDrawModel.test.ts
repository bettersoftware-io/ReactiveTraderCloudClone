import { describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "@rtc/domain";

import {
  type BubbleDrawEntry,
  buildBubbleDrawModel,
  centerTextX,
  currencyFontSize,
  scaleBubbleRadius,
} from "#/ui/analytics/bubbleDrawModel";

/**
 * A deliberately spread book. `scaleBubbleRadius` sizes each bubble on its
 * share of the LARGEST absolute exposure, so the three nets below (+10M EUR,
 * -20M GBP, +100M AUD) are 10%, 20% and 100% of the book and land on diameters
 * of 34.4, 38.8 and 74 — the last both the ramp's cap and the only one over
 * the large-label threshold. CAD nets to zero and is dropped.
 *
 * The ratios are the point: the same three magnitudes under the domain's own
 * `[min, max] -> [15, 60]` scale gave 30, 40 and 120px, a spread of 4x on a
 * phone card. The design's ramp compresses that to ~2.2x.
 */
const SPREAD_BOOK: readonly CurrencyPairPosition[] = [
  {
    symbol: "EURGBP",
    basePnl: 0,
    baseTradedAmount: 10_000_000,
    counterTradedAmount: -20_000_000,
  },
  {
    symbol: "AUDCAD",
    basePnl: 0,
    baseTradedAmount: 100_000_000,
    counterTradedAmount: 0,
  },
];

const WIDTH = 320;

describe("buildBubbleDrawModel", () => {
  it("draws one bubble per currency with a non-zero net, largest first", () => {
    const { entries } = buildBubbleDrawModel(SPREAD_BOOK, WIDTH);

    // Shelf-packing orders by radius descending, so this is also draw order.
    expect(
      entries.map((entry) => {
        return entry.currency;
      }),
    ).toStrictEqual(["AUD", "GBP", "EUR"]);
  });

  it("drops a currency whose net exposure is zero", () => {
    const { entries } = buildBubbleDrawModel(SPREAD_BOOK, WIDTH);

    // CAD appears in AUDCAD but its counter amount is 0.
    expect(
      entries.some((entry) => {
        return entry.currency === "CAD";
      }),
    ).toBe(false);
  });

  it("takes each bubble's sign from its aggregated net, not from one leg", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    expect(byCurrency.AUD.sign).toBe("pos");
    expect(byCurrency.EUR.sign).toBe("pos");
    expect(byCurrency.GBP.sign).toBe("neg");
  });

  it("packs bubbles to the measured width and reports the height needed", () => {
    const { entries, height } = buildBubbleDrawModel(SPREAD_BOOK, WIDTH);
    const byCurrency = indexEntries(SPREAD_BOOK);

    // AUD (r 37, the ramp's 74px cap) fills the first slot; GBP (r 19.4) and
    // EUR (r 17.2) follow on the same shelf, each advanced by the previous
    // diameter plus the 8px gap.
    expect(byCurrency.AUD).toMatchObject({ x: 37, y: 37, radius: 37 });
    expect(byCurrency.GBP).toMatchObject({ x: 101.4, y: 19.4, radius: 19.4 });
    expect(byCurrency.EUR).toMatchObject({ x: 146, y: 17.2, radius: 17.2 });
    // Tallest bubble on the only shelf.
    expect(height).toBe(74);
    expect(entries).toHaveLength(3);

    for (const entry of entries) {
      expect(entry.x + entry.radius).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("repacks when the viewport narrows, rather than overflowing it", () => {
    const wide = buildBubbleDrawModel(SPREAD_BOOK, WIDTH);
    const narrow = buildBubbleDrawModel(SPREAD_BOOK, 120);

    // At 120 the shelf can no longer hold all three, so the cluster gets taller.
    expect(narrow.height).toBeGreaterThan(wide.height);

    for (const entry of narrow.entries) {
      expect(entry.x + entry.radius).toBeLessThanOrEqual(120);
    }
  });

  it("labels every bubble, the smallest included", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    // T37: the floor is 30px, the MOBILE prototype's own smallest bubble
    // (`30 + (|usd| / maxExp) * 44`), not the 40 taken from the web
    // prototype's `40 + sqrt(|M|) * 11`. At the mobile amount size of 7.5px a
    // 30px bubble fits its value, and the design's template labels every
    // bubble unconditionally. Now that the ramp is what sizes the bubbles, its
    // floor IS that threshold, so no bubble can fall under it.
    // The mobile design's bubble amounts are UNSIGNED on the positive side
    // (the ring colour carries the direction) and two-decimal in M — the
    // `fmtK(e.usd).replace('+','')` of dc.html L964, over the raw net rather
    // than a pre-rounded millions figure.
    expect(byCurrency.AUD.amount).toBe("100.00M");
    expect(byCurrency.GBP.amount).toBe("-20.00M");
    expect(byCurrency.EUR.amount).toBe("10.00M");
  });

  // A sub-million net keeps its K suffix rather than collapsing to "0.9M":
  // the amount is formatted from the raw aggregate, not from
  // `netExposureByCurrency`'s tenth-of-a-million rounding. At 9% of the book
  // its bubble sits just over the 30px floor (33.96px) and is still labelled.
  it("prints a sub-million net in K, not a rounded M", () => {
    const byCurrency = indexEntries([
      {
        symbol: "EURGBP",
        basePnl: 0,
        baseTradedAmount: 10_000_000,
        counterTradedAmount: -900_000,
      },
    ]);

    expect(byCurrency.GBP.amount).toBe("-900.0K");
    expect(byCurrency.EUR.amount).toBe("10.00M");
  });

  // T37: the mobile design uses ONE currency size (9px/600, dc.html:196), so
  // the step-up is a no-op today. The seam is kept — and asserted flat — so a
  // future size split is a deliberate edit rather than an accident.
  it("uses one currency size either side of the 62px diameter", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    expect(byCurrency.AUD.currencyFontSize).toBe(9); // 74px across
    expect(byCurrency.GBP.currencyFontSize).toBe(9); // 38.8px across
  });

  it("drops the currency label below centre only when it stands alone", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    // Stacked over an amount: the pair straddles the centre line.
    expect(byCurrency.AUD.currencyBaseline).toBeLessThan(0);
    expect(byCurrency.AUD.amountBaseline).toBeGreaterThan(0);
    // EUR now carries an amount too (see the floor change above), so it is
    // stacked rather than alone — the lone-label branch is exercised by
    // `currencyBaseline` directly below.
    expect(byCurrency.EUR.currencyBaseline).toBeLessThan(0);
    expect(byCurrency.EUR.amountBaseline).toBeGreaterThan(0);
  });

  it("returns nothing to draw for an empty book", () => {
    expect(buildBubbleDrawModel([], WIDTH)).toStrictEqual({
      entries: [],
      height: 0,
    });
  });
});

describe("scaleBubbleRadius", () => {
  it("puts the book's largest exposure on the ramp's 74px cap", () => {
    expect(scaleBubbleRadius(24_800_000, 24_800_000)).toBe(37);
  });

  it("puts a zero exposure on the ramp's 30px floor", () => {
    expect(scaleBubbleRadius(0, 24_800_000)).toBe(15);
  });

  it("interpolates linearly on the share of the largest exposure", () => {
    // Half the book's top exposure is HALF WAY UP THE RAMP (52px), not half
    // the cap — the ramp starts at 30, it does not start at zero.
    expect(scaleBubbleRadius(12_400_000, 24_800_000)).toBe(26);
    expect(scaleBubbleRadius(6_200_000, 24_800_000)).toBe(20.5);
  });

  it("falls back to the floor when the book has no exposure at all", () => {
    // Guards the divide: an empty book has no maximum to take a share of.
    expect(scaleBubbleRadius(0, 0)).toBe(15);
  });
});

describe("currencyFontSize", () => {
  it("sizes on the diameter, exclusive at the threshold", () => {
    expect(currencyFontSize(31)).toBe(9); // exactly 62px across
    expect(currencyFontSize(31.5)).toBe(9); // just over — same size today
  });
});

describe("centerTextX", () => {
  it("centres a run of text on a point by offsetting half its width", () => {
    expect(centerTextX(0, 24)).toBe(-12);
    expect(centerTextX(100, 30)).toBe(85);
  });
});

function indexEntries(
  positions: readonly CurrencyPairPosition[],
): Record<string, BubbleDrawEntry> {
  const { entries } = buildBubbleDrawModel(positions, WIDTH);

  return Object.fromEntries(
    entries.map((entry) => {
      return [entry.currency, entry];
    }),
  );
}
