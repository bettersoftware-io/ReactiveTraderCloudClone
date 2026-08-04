import { EMPTY, from, Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type AnalyticsPort,
  type BlotterPort,
  Direction,
  type PositionUpdates,
  type PriceTick,
  type PricingPort,
  type ReferenceDataPort,
  type Trade,
  TradeStatus,
} from "@rtc/domain";
import type { PanelSpecV1 } from "@rtc/shared";

import {
  composePanelStream,
  type PanelData,
  type PanelStreamDeps,
} from "./composePanelStream";

describe("composePanelStream", () => {
  it("fxTicks + line accumulates points per symbol as ticks arrive", () => {
    const t1 = makeTick("EURUSD", 1.1, 1_000);
    const t2 = makeTick("EURUSD", 1.2, 2_000);
    const t3 = makeTick("EURUSD", 1.3, 3_000);
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from([t1, t2, t3]) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      viz: { kind: "line" },
    });

    const emissions = collect(composePanelStream(spec, deps));

    expect(emissions).toHaveLength(3);
    expect(emissions[2]).toEqual({
      kind: "line",
      series: [
        {
          label: "EURUSD",
          points: [
            { t: 1_000, v: 1.1 },
            { t: 2_000, v: 1.2 },
            { t: 3_000, v: 1.3 },
          ],
        },
      ],
      annotations: [],
    } satisfies PanelData);
  });

  it("window transform trims points older than N seconds relative to the newest point in the series", () => {
    const t1 = makeTick("EURUSD", 1.1, 0);
    const t2 = makeTick("EURUSD", 1.2, 5_000);
    const t3 = makeTick("EURUSD", 1.3, 11_000);
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from([t1, t2, t3]) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      transforms: [{ kind: "window", seconds: 10 }],
      viz: { kind: "line" },
    });

    const last = lastEmission(composePanelStream(spec, deps));

    // cutoff = 11_000 - 10_000 = 1_000, so t1 (t=0) drops, t2/t3 survive.
    expect(last).toEqual({
      kind: "line",
      series: [
        {
          label: "EURUSD",
          points: [
            { t: 5_000, v: 1.2 },
            { t: 11_000, v: 1.3 },
          ],
        },
      ],
      annotations: [],
    } satisfies PanelData);
  });

  it("returns transform computes tick-over-tick fractional change (hand-computed, 3 ticks)", () => {
    const t1 = makeTick("EURUSD", 100, 0);
    const t2 = makeTick("EURUSD", 110, 1_000); // (110-100)/100 = 0.1
    const t3 = makeTick("EURUSD", 99, 2_000); // (99-110)/110 = -0.1
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from([t1, t2, t3]) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      transforms: [{ kind: "returns" }],
      viz: { kind: "line" },
    });

    const last = lastEmission(composePanelStream(spec, deps));

    expect(last.kind).toBe("line");
    const line = last as LinePanelData;
    const points = line.series[0]?.points ?? [];
    expect(points).toHaveLength(2);
    expect(points[0]?.t).toBe(1_000);
    expect(points[0]?.v).toBeCloseTo(0.1, 10);
    expect(points[1]?.t).toBe(2_000);
    expect(points[1]?.v).toBeCloseTo(-0.1, 10);
  });

  it("rollingVol transform computes the population stddev over a trailing sample window (hand-computed, 5 ticks)", () => {
    const values = [10, 12, 14, 16, 18];
    const ticks = values.map((v, i) => {
      return makeTick("EURUSD", v, i * 1_000);
    });
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from(ticks) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      transforms: [{ kind: "rollingVol", samples: 3 }],
      viz: { kind: "line" },
    });

    const last = lastEmission(composePanelStream(spec, deps));
    const line = last as LinePanelData;
    const points = line.series[0]?.points ?? [];

    // Every 3-wide window here is evenly spaced by 2, so each population
    // stddev is identically sqrt(8/3).
    const expectedStddev = Math.sqrt(8 / 3);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.t)).toEqual([2_000, 3_000, 4_000]);

    for (const p of points) {
      expect(p.v).toBeCloseTo(expectedStddev, 10);
    }
  });

  it("spread transform subtracts one series from another, aligned by index", () => {
    const eur1 = makeTick("EURUSD", 110, 0);
    const eur2 = makeTick("EURUSD", 112, 1_000);
    const gbp1 = makeTick("GBPUSD", 130, 0);
    const gbp2 = makeTick("GBPUSD", 128, 1_000);
    const deps = makeDeps({
      pricing: fakePricing({
        EURUSD: from([eur1, eur2]),
        GBPUSD: from([gbp1, gbp2]),
      }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD", "GBPUSD"] },
      transforms: [{ kind: "spread", a: "EURUSD", b: "GBPUSD" }],
      viz: { kind: "line" },
    });

    const last = lastEmission(composePanelStream(spec, deps));

    expect(last).toEqual({
      kind: "line",
      series: [
        {
          label: "EURUSD-GBPUSD",
          points: [
            { t: 0, v: -20 },
            { t: 1_000, v: -16 },
          ],
        },
      ],
      annotations: [],
    } satisfies PanelData);
  });

  it("topN transform sorts a table descending by 'value' and limits to n rows", () => {
    const updates = makePositionUpdates([
      {
        symbol: "EURUSD",
        basePnl: 500,
        baseTradedAmount: 1,
        counterTradedAmount: 1,
      },
      {
        symbol: "GBPUSD",
        basePnl: -200,
        baseTradedAmount: 1,
        counterTradedAmount: 1,
      },
      {
        symbol: "USDJPY",
        basePnl: 1_500,
        baseTradedAmount: 1,
        counterTradedAmount: 1,
      },
      {
        symbol: "AUDUSD",
        basePnl: 100,
        baseTradedAmount: 1,
        counterTradedAmount: 1,
      },
    ]);
    const deps = makeDeps({ analytics: fakeAnalytics(of(updates)) });
    const spec = makeSpec({
      source: { kind: "analytics" },
      transforms: [{ kind: "topN", n: 2, by: "value" }],
      viz: { kind: "table" },
    });

    const last = lastEmission(composePanelStream(spec, deps));
    const table = last as TablePanelData;

    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells[0]).toBe("USDJPY");
    expect(table.rows[1]?.cells[0]).toBe("EURUSD");
  });

  it("analytics source maps positions straight to a table (tone by P&L sign)", () => {
    const updates = makePositionUpdates([
      {
        symbol: "EURUSD",
        basePnl: 250,
        baseTradedAmount: 1_000,
        counterTradedAmount: 900,
      },
      {
        symbol: "GBPUSD",
        basePnl: -50,
        baseTradedAmount: 500,
        counterTradedAmount: 600,
      },
    ]);
    const deps = makeDeps({ analytics: fakeAnalytics(of(updates)) });
    const spec = makeSpec({
      source: { kind: "analytics" },
      viz: { kind: "table" },
    });

    const last = lastEmission(composePanelStream(spec, deps));
    const table = last as TablePanelData;

    expect(table.columns).toEqual(["Symbol", "P&L", "Base Amt", "Counter Amt"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toMatchObject({
      cells: ["EURUSD", "+$0.3k", "1,000", "900"],
      tone: "up",
    });
    expect(table.rows[1]).toMatchObject({
      cells: ["GBPUSD", "-$0.1k", "500", "600"],
      tone: "down",
    });
  });

  it("blotter source maps recent trades to a table (tone by trade status)", () => {
    const done = makeTrade({
      tradeId: 1,
      tradeName: "T-1",
      status: TradeStatus.Done,
    });
    const rejected = makeTrade({
      tradeId: 2,
      tradeName: "T-2",
      status: TradeStatus.Rejected,
    });
    const deps = makeDeps({ blotter: fakeBlotter(of([done, rejected])) });
    const spec = makeSpec({
      source: { kind: "blotter" },
      viz: { kind: "table" },
    });

    const last = lastEmission(composePanelStream(spec, deps));
    const table = last as TablePanelData;

    expect(table.columns).toEqual([
      "Trade",
      "Pair",
      "Notional",
      "Rate",
      "Status",
    ]);
    const doneRow = table.rows.find((r) => {
      return r.cells[0] === "T-1";
    });
    const rejectedRow = table.rows.find((r) => {
      return r.cells[0] === "T-2";
    });
    expect(doneRow?.tone).toBe("up");
    expect(rejectedRow?.tone).toBe("danger");
  });

  it("a transform chain nonsensical for its source yields a valid, empty PanelData instead of throwing (rollingVol on blotter)", () => {
    const deps = makeDeps({
      blotter: fakeBlotter(of([makeTrade({})])),
    });
    const lineSpec = makeSpec({
      source: { kind: "blotter" },
      transforms: [{ kind: "rollingVol", samples: 3 }],
      viz: { kind: "line" },
    });
    const tableSpec = makeSpec({
      source: { kind: "blotter" },
      transforms: [{ kind: "rollingVol", samples: 3 }],
      viz: { kind: "table" },
    });

    expect(() => {
      collect(composePanelStream(lineSpec, deps));
    }).not.toThrow();
    expect(lastEmission(composePanelStream(lineSpec, deps))).toEqual({
      kind: "line",
      series: [],
      annotations: [],
    } satisfies PanelData);
    expect(lastEmission(composePanelStream(tableSpec, deps))).toEqual({
      kind: "table",
      columns: [],
      rows: [],
    } satisfies PanelData);
  });

  it("a topN transform applied to a series source (fxTicks) also degrades to an empty table, not a throw", () => {
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from([makeTick("EURUSD", 1, 0)]) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      transforms: [{ kind: "topN", n: 3, by: "value" }],
      viz: { kind: "table" },
    });

    expect(lastEmission(composePanelStream(spec, deps))).toEqual({
      kind: "table",
      columns: [],
      rows: [],
    } satisfies PanelData);
  });

  it("caps an accumulating series at 600 in-memory points, dropping the oldest", () => {
    const ticks = Array.from({ length: 601 }, (_unused, i) => {
      return makeTick("EURUSD", i, i * 1_000);
    });
    const deps = makeDeps({
      pricing: fakePricing({ EURUSD: from(ticks) }),
    });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      viz: { kind: "line" },
    });

    const last = lastEmission(composePanelStream(spec, deps));
    const line = last as LinePanelData;
    const points = line.series[0]?.points ?? [];

    expect(points).toHaveLength(600);
    // tick 0 (t=0) was evicted; the surviving window is ticks 1..600.
    expect(points[0]?.t).toBe(1_000);
    expect(points[599]?.t).toBe(600_000);
  });

  it("shares exactly one underlying port subscription across concurrent UI subscribers, and releases it once all unsubscribe", () => {
    let subscribeCount = 0;
    let unsubscribeCount = 0;
    const ticks$ = new Observable<PriceTick>((subscriber) => {
      subscribeCount += 1;
      subscriber.next(makeTick("EURUSD", 1, 0));
      return (): void => {
        unsubscribeCount += 1;
      };
    });
    const deps = makeDeps({ pricing: fakePricing({ EURUSD: ticks$ }) });
    const spec = makeSpec({
      source: { kind: "fxTicks", symbols: ["EURUSD"] },
      viz: { kind: "line" },
    });

    const data$ = composePanelStream(spec, deps);
    const subA = data$.subscribe();
    const subB = data$.subscribe();

    expect(subscribeCount).toBe(1);

    subA.unsubscribe();
    expect(unsubscribeCount).toBe(0);

    subB.unsubscribe();
    expect(unsubscribeCount).toBe(1);
  });

  describe("every PanelViz kind is reachable from at least one source", () => {
    it("line ← fxTicks", () => {
      const deps = makeDeps({
        pricing: fakePricing({ EURUSD: from([makeTick("EURUSD", 1, 0)]) }),
      });
      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        viz: { kind: "line" },
      });
      expect(lastEmission(composePanelStream(spec, deps)).kind).toBe("line");
    });

    it("table ← analytics", () => {
      const deps = makeDeps({
        analytics: fakeAnalytics(
          of(
            makePositionUpdates([
              {
                symbol: "EURUSD",
                basePnl: 1,
                baseTradedAmount: 1,
                counterTradedAmount: 1,
              },
            ]),
          ),
        ),
      });
      const spec = makeSpec({
        source: { kind: "analytics" },
        viz: { kind: "table" },
      });
      const last = lastEmission(composePanelStream(spec, deps));
      expect(last.kind).toBe("table");
      expect((last as TablePanelData).rows).toHaveLength(1);
    });

    it("gauge ← fxTicks", () => {
      const t1 = makeTick("EURUSD", 1.1, 0);
      const t2 = makeTick("EURUSD", 1.3, 1_000);
      const deps = makeDeps({
        pricing: fakePricing({ EURUSD: from([t1, t2]) }),
      });
      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        viz: { kind: "gauge", label: "EURUSD" },
      });
      const last = lastEmission(composePanelStream(spec, deps));
      expect(last).toMatchObject({
        kind: "gauge",
        label: "EURUSD",
        tone: "up",
      });
    });

    it("sparkGrid ← priceHistory", () => {
      const deps = makeDeps({
        pricing: fakePricing(
          {},
          {
            EURUSD: of([
              makeTick("EURUSD", 1, 0),
              makeTick("EURUSD", 1.05, 1_000),
            ]),
            GBPUSD: of([
              makeTick("GBPUSD", 1.3, 0),
              makeTick("GBPUSD", 1.28, 1_000),
            ]),
          },
        ),
      });
      const spec = makeSpec({
        source: { kind: "priceHistory", symbols: ["EURUSD", "GBPUSD"] },
        viz: { kind: "sparkGrid" },
      });
      const last = lastEmission(composePanelStream(spec, deps));
      expect(last.kind).toBe("sparkGrid");
      const sparkGrid = last as SparkGridPanelData;
      expect(sparkGrid.cells).toHaveLength(2);
      expect(sparkGrid.cells[0]?.points).toEqual([1, 1.05]);
    });

    it("heatmap ← analytics", () => {
      const deps = makeDeps({
        analytics: fakeAnalytics(
          of(
            makePositionUpdates([
              {
                symbol: "EURUSD",
                basePnl: 5_000,
                baseTradedAmount: 1,
                counterTradedAmount: 1,
              },
            ]),
          ),
        ),
      });
      const spec = makeSpec({
        source: { kind: "analytics" },
        viz: { kind: "heatmap" },
      });
      const last = lastEmission(composePanelStream(spec, deps));
      expect(last.kind).toBe("heatmap");
      const heatmap = last as HeatmapPanelData;
      expect(heatmap.rows).toHaveLength(1);
      expect(heatmap.rows[0]?.label).toBe("EURUSD");
      expect(heatmap.rows[0]?.cells[0]?.intensity).toBeCloseTo(0.5, 10);
    });
  });
});

// Named tags (rather than inline `{ kind: "…" }` literals) so `Extract<
// PanelData, ...>` never takes an inline object type argument — mirrors
// JarvisMachine.ts's/JarvisPanelsMachine.ts's identical Tag idiom (the
// repo's `no-restricted-syntax` bans inline object types as a type
// argument, even in a test file).
interface LineTag {
  readonly kind: "line";
}
interface TableTag {
  readonly kind: "table";
}
interface SparkGridTag {
  readonly kind: "sparkGrid";
}
interface HeatmapTag {
  readonly kind: "heatmap";
}
type LinePanelData = Extract<PanelData, LineTag>;
type TablePanelData = Extract<PanelData, TableTag>;
type SparkGridPanelData = Extract<PanelData, SparkGridTag>;
type HeatmapPanelData = Extract<PanelData, HeatmapTag>;

function makeTick(symbol: string, mid: number, t: number): PriceTick {
  return {
    symbol,
    bid: mid - 1,
    ask: mid + 1,
    mid,
    valueDate: "2026-08-04",
    creationTimestamp: t,
  };
}

function fakeReferenceData(): ReferenceDataPort {
  return {
    getCurrencyPairs: () => {
      return of([]);
    },
  };
}

function fakePricing(
  overrides: Partial<Record<string, Observable<PriceTick>>> = {},
  history: Partial<Record<string, Observable<readonly PriceTick[]>>> = {},
): PricingPort {
  return {
    getPriceUpdates: (symbol: string) => {
      return overrides[symbol] ?? EMPTY;
    },
    getPriceHistory: (symbol: string) => {
      return history[symbol] ?? of([]);
    },
    getRfqQuote: () => {
      return EMPTY;
    },
  };
}

function fakeBlotter(
  trades$: Observable<readonly Trade[]> = of([]),
): BlotterPort {
  return {
    getTradeStream: () => {
      return trades$;
    },
  };
}

function fakeAnalytics(
  updates$: Observable<PositionUpdates> = EMPTY,
): AnalyticsPort {
  return {
    getAnalytics: () => {
      return updates$;
    },
  };
}

function makeDeps(overrides: Partial<PanelStreamDeps> = {}): PanelStreamDeps {
  return {
    referenceData: fakeReferenceData(),
    pricing: fakePricing(),
    blotter: fakeBlotter(),
    analytics: fakeAnalytics(),
    ...overrides,
  };
}

function makeSpec(
  overrides: Partial<PanelSpecV1> & Pick<PanelSpecV1, "source" | "viz">,
): PanelSpecV1 {
  return { v: 1, title: "Test panel", transforms: [], ...overrides };
}

/** Synchronously collects every value a (synchronous, self-completing or
 * still-open) observable emits during `.subscribe()`. */
function collect<T>(source: Observable<T>): readonly T[] {
  const values: T[] = [];
  source.subscribe((v) => {
    values.push(v);
  });
  return values;
}

function lastEmission<T>(source: Observable<T>): T {
  const values = collect(source);
  const last = values[values.length - 1];

  if (last === undefined) {
    throw new Error("expected at least one emission");
  }

  return last;
}

function makeTrade(overrides: Partial<Trade>): Trade {
  return {
    tradeId: 1,
    tradeName: "T-1",
    currencyPair: "EURUSD",
    notional: 1_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.1,
    status: TradeStatus.Done,
    tradeDate: "2026-08-04",
    valueDate: "2026-08-06",
    ...overrides,
  };
}

function makePositionUpdates(
  positions: PositionUpdates["currentPositions"],
): PositionUpdates {
  return { currentPositions: positions, history: [] };
}
