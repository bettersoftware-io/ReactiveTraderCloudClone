import { describe, expect, it } from "vitest";

import type { Candle } from "@rtc/domain";

import {
  buildCandles,
  CANDLE_HEIGHT,
  CANDLE_WIDTH,
} from "#/ui/equities/trade/buildCandles";

describe("buildCandles", () => {
  it("returns [] for no candles", () => {
    expect(buildCandles([])).toEqual([]);
  });
  it("maps a single up candle to full-height geometry", () => {
    // one candle, w=300 h=160, padX=2 padY=4: plotW=296 slotW=296 x=2+148=150
    // plotH=h-padY*2=152; prices high=10 low=0 range=10; toY(10)=4, toY(0)=4+152=156; body open=2 close=8 up
    // bodyTop=toY(8)=4+(1-0.8)*152=4+30.4=34.4 bodyBot=toY(2)=4+(1-0.2)*152=4+121.6=125.6
    const [g] = buildCandles([c(2, 10, 0, 8)]);
    expect(g.x).toBeCloseTo(150, 5);
    expect(g.up).toBe(true);
    expect(g.wickTop).toBeCloseTo(4, 5);
    expect(g.wickBottom).toBeCloseTo(156, 5);
    expect(g.bodyY).toBeCloseTo(34.4, 5);
    expect(g.bodyH).toBeCloseTo(91.2, 5);
    expect(g.barW).toBeCloseTo(177.6, 5); // slotW*0.6 = 296*0.6
    expect(CANDLE_WIDTH).toBe(300);
    expect(CANDLE_HEIGHT).toBe(160);
  });
  it("marks a down candle and never returns a zero-height body", () => {
    const [down] = buildCandles([c(8, 9, 3, 4)]); // close(4) < open(8) => down
    expect(down.up).toBe(false);
    const [flat] = buildCandles([c(8, 8, 8, 8)]); // range collapses to 1, body clamps to >=1
    expect(flat.bodyH).toBeGreaterThanOrEqual(1);
  });
});

function c(open: number, high: number, low: number, close: number): Candle {
  return {
    time: 0,
    open,
    high,
    low,
    close,
  };
}
