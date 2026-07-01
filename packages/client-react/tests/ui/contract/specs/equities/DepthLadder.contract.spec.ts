import { DepthLadder } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { DepthBook } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const BOOK: DepthBook = {
  symbol: "AAPL",
  bids: [
    { price: 99.9, size: 500 },
    { price: 99.8, size: 300 },
  ],
  asks: [
    { price: 100.1, size: 400 },
    { price: 100.2, size: 200 },
  ],
};

describe("DepthLadder", () => {
  it("shows an empty-state placeholder when there is no book", () => {
    const ladder = mount(DepthLadder, { props: { symbol: "AAPL" } });

    expect(ladder.isEmpty()).toBe(true);
  });

  it("renders bid and ask rows plus the spread when a book arrives", () => {
    const ladder = mount(DepthLadder, {
      props: { symbol: "AAPL" },
      equities: { depth: { AAPL: BOOK } },
    });

    expect(ladder.isEmpty()).toBe(false);
    expect(ladder.rowCount("bid")).toBe(2);
    expect(ladder.rowCount("ask")).toBe(2);
    expect(ladder.spread()).toMatch(/spread 0\.20/i);
  });

  it("dashes the spread for a present-but-empty book", () => {
    const ladder = mount(DepthLadder, {
      props: { symbol: "AAPL" },
      equities: { depth: { AAPL: { symbol: "AAPL", bids: [], asks: [] } } },
    });

    expect(ladder.isEmpty()).toBe(false);
    expect(ladder.rowCount("bid")).toBe(0);
    expect(ladder.rowCount("ask")).toBe(0);
    expect(ladder.spread()).toMatch(/spread —/i);
  });
});
