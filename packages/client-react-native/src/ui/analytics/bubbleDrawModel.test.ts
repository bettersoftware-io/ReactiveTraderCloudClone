import { describe, expect, it } from "vitest";

import type { CurrencyPairPosition } from "@rtc/domain";

import {
  type BubbleDrawEntry,
  buildBubbleDrawModel,
  centerTextX,
  currencyFontSize,
  formatMillions,
} from "#/ui/analytics/bubbleDrawModel";

/**
 * A deliberately spread book. `aggregatePositionsByCurrency` scales radius
 * linearly from the smallest magnitude in the book to the largest, so the
 * three net exposures below (+10M EUR, -20M GBP, +100M AUD) land on radii of
 * exactly 15, 20 and 60 — one below the amount-label threshold, one exactly on
 * it, one above the large-label threshold. CAD nets to zero and is dropped.
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

    // AUD (r 60) fills the first slot; GBP (r 20) and EUR (r 15) follow on the
    // same shelf, each advanced by the previous diameter plus the 8px gap.
    expect(byCurrency.AUD).toMatchObject({ x: 60, y: 60, radius: 60 });
    expect(byCurrency.GBP).toMatchObject({ x: 148, y: 20, radius: 20 });
    expect(byCurrency.EUR).toMatchObject({ x: 191, y: 15, radius: 15 });
    // Tallest bubble on the only shelf.
    expect(height).toBe(120);
    expect(entries).toHaveLength(3);

    for (const entry of entries) {
      expect(entry.x + entry.radius).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("repacks when the viewport narrows, rather than overflowing it", () => {
    const wide = buildBubbleDrawModel(SPREAD_BOOK, WIDTH);
    const narrow = buildBubbleDrawModel(SPREAD_BOOK, 160);

    // At 160 the shelf can no longer hold all three, so the cluster gets taller.
    expect(narrow.height).toBeGreaterThan(wide.height);

    for (const entry of narrow.entries) {
      expect(entry.x + entry.radius).toBeLessThanOrEqual(160);
    }
  });

  it("labels only the bubbles wide enough to hold a second line", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    // AUD is 120px across, GBP exactly 40 — the threshold, which is inclusive.
    expect(byCurrency.AUD.amount).toBe("+100.0M");
    expect(byCurrency.GBP.amount).toBe("-20.0M");
    // EUR is 30px across: an amount would spill outside the circle.
    expect(byCurrency.EUR.amount).toBeNull();
  });

  it("steps the currency label up a size only past the 62px diameter", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    expect(byCurrency.AUD.currencyFontSize).toBe(15); // 120px across
    expect(byCurrency.GBP.currencyFontSize).toBe(12); // 40px across
  });

  it("drops the currency label below centre only when it stands alone", () => {
    const byCurrency = indexEntries(SPREAD_BOOK);

    // Stacked over an amount: the pair straddles the centre line.
    expect(byCurrency.AUD.currencyBaseline).toBeLessThan(0);
    expect(byCurrency.AUD.amountBaseline).toBeGreaterThan(0);
    // Alone: nudged below centre so it reads optically centred, since text
    // hangs from its baseline rather than being boxed.
    expect(byCurrency.EUR.currencyBaseline).toBeGreaterThan(0);
  });

  it("returns nothing to draw for an empty book", () => {
    expect(buildBubbleDrawModel([], WIDTH)).toStrictEqual({
      entries: [],
      height: 0,
    });
  });
});

describe("currencyFontSize", () => {
  it("sizes on the diameter, exclusive at the threshold", () => {
    expect(currencyFontSize(31)).toBe(12); // exactly 62px across
    expect(currencyFontSize(31.5)).toBe(15); // just over
  });
});

describe("formatMillions", () => {
  it("matches the web client's bubble format", () => {
    expect(formatMillions(15.2)).toBe("+15.2M");
    expect(formatMillions(-22.8)).toBe("-22.8M");
    expect(formatMillions(4)).toBe("+4.0M");
  });

  // A short position small enough to round to zero keeps its negative COLOUR
  // but loses its sign in the text, because `toFixed` drops the sign of -0.
  // Pinned because it looks like a bug and is not: the web client does the
  // same, and matching it is the point.
  it("prints a rounds-to-zero short position without a sign", () => {
    expect(formatMillions(-0)).toBe("0.0M");
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
