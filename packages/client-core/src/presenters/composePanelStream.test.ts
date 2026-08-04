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
    expect(
      points.map((p) => {
        return p.t;
      }),
    ).toEqual([2_000, 3_000, 4_000]);

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

    const pending = makeTrade({
      tradeId: 3,
      tradeName: "T-3",
      status: TradeStatus.Pending,
    });

    const deps = makeDeps({
      blotter: fakeBlotter(of([done, rejected, pending])),
    });

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

    const pendingRow = table.rows.find((r) => {
      return r.cells[0] === "T-3";
    });
    expect(doneRow?.tone).toBe("up");
    expect(rejectedRow?.tone).toBe("danger");
    expect(pendingRow?.tone).toBe("info");
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

  describe("transform order (the fold is neither associative nor commutative)", () => {
    // Shared fixture for both orderings: t=0(100), t=1000(110), t=2000(99),
    // t=3000(120).
    function orderedTicks(): readonly PriceTick[] {
      return [
        makeTick("EURUSD", 100, 0),
        makeTick("EURUSD", 110, 1_000),
        makeTick("EURUSD", 99, 2_000),
        makeTick("EURUSD", 120, 3_000),
      ];
    }

    it("[window, returns] differs from [returns, window] over the same ticks (hand-computed)", () => {
      const depsWindowThenReturns = makeDeps({
        pricing: fakePricing({ EURUSD: from(orderedTicks()) }),
      });

      const depsReturnsThenWindow = makeDeps({
        pricing: fakePricing({ EURUSD: from(orderedTicks()) }),
      });

      const windowThenReturns = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "window", seconds: 2 }, { kind: "returns" }],
        viz: { kind: "line" },
      });

      const returnsThenWindow = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "returns" }, { kind: "window", seconds: 2 }],
        viz: { kind: "line" },
      });

      // window(2s) FIRST: cutoff = 3_000 - 2_000 = 1_000, so t=0 (100) drops,
      // leaving [110@1000, 99@2000, 120@3000]. THEN returns over those 3
      // points yields 2: (99-110)/110 ≈ -0.1 @2000, (120-99)/99 ≈ 0.21212 @3000.
      const windowFirst = lastEmission(
        composePanelStream(windowThenReturns, depsWindowThenReturns),
      ) as LinePanelData;
      const windowFirstPoints = windowFirst.series[0]?.points ?? [];
      expect(windowFirstPoints).toHaveLength(2);
      expect(
        windowFirstPoints.map((p) => {
          return p.t;
        }),
      ).toEqual([2_000, 3_000]);
      expect(windowFirstPoints[0]?.v).toBeCloseTo(-0.1, 10);
      expect(windowFirstPoints[1]?.v).toBeCloseTo(21 / 99, 10);

      // returns FIRST over all 4 raw ticks yields 3 points: 0.1@1000,
      // -0.1@2000, 0.21212@3000. THEN window(2s): cutoff = 3_000 - 2_000 =
      // 1_000, and every one of those 3 points already has t >= 1_000, so
      // NONE are trimmed — all 3 survive, unlike the other ordering.
      const returnsFirst = lastEmission(
        composePanelStream(returnsThenWindow, depsReturnsThenWindow),
      ) as LinePanelData;
      const returnsFirstPoints = returnsFirst.series[0]?.points ?? [];
      expect(returnsFirstPoints).toHaveLength(3);
      expect(
        returnsFirstPoints.map((p) => {
          return p.t;
        }),
      ).toEqual([1_000, 2_000, 3_000]);
      expect(returnsFirstPoints[0]?.v).toBeCloseTo(0.1, 10);
      expect(returnsFirstPoints[1]?.v).toBeCloseTo(-0.1, 10);
      expect(returnsFirstPoints[2]?.v).toBeCloseTo(21 / 99, 10);

      // The two orderings are NOT the same interpreter output.
      expect(windowFirstPoints.length).not.toBe(returnsFirstPoints.length);
    });

    it("sticky-empty: once a transform empties the frame, every later transform in the chain is a no-op (no throw)", () => {
      const deps = makeDeps({
        blotter: fakeBlotter(of([makeTrade({})])),
      });

      // rollingVol requires a "series" frame; blotter yields "table", so it
      // empties immediately. topN normally WOULD apply cleanly to a table —
      // proving it's skipped here (not silently re-interpreting the
      // already-empty frame as a fresh table) is the point of this test.
      const spec = makeSpec({
        source: { kind: "blotter" },
        transforms: [
          { kind: "rollingVol", samples: 3 },
          { kind: "topN", n: 2, by: "value" },
        ],
        viz: { kind: "table" },
      });

      expect(() => {
        collect(composePanelStream(spec, deps));
      }).not.toThrow();
      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "table",
        columns: [],
        rows: [],
      } satisfies PanelData);
    });
  });

  describe("spread transform: unequal tick rates", () => {
    it("pairs the NEWEST points of each series when lengths differ, not the oldest (hand-computed)", () => {
      const eurTicks = [100, 101, 102, 103, 104].map((v, i) => {
        return makeTick("EURUSD", v, i * 1_000);
      });

      const gbpTicks = [50, 51, 52].map((v, i) => {
        return makeTick("GBPUSD", v, 500 + i * 1_000);
      });

      const deps = makeDeps({
        pricing: fakePricing({
          EURUSD: from(eurTicks),
          GBPUSD: from(gbpTicks),
        }),
      });

      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD", "GBPUSD"] },
        transforms: [{ kind: "spread", a: "EURUSD", b: "GBPUSD" }],
        viz: { kind: "line" },
      });

      const last = lastEmission(
        composePanelStream(spec, deps),
      ) as LinePanelData;
      const points = last.series[0]?.points ?? [];

      // EURUSD has 5 points (idx 0..4), GBPUSD has 3 (idx 0..2); len=3, so
      // EURUSD is read from idx 2..4 (its newest 3) and GBPUSD from idx 0..2
      // (all of it) — NOT EURUSD's idx 0..2 (its oldest, and 1.5s stale
      // relative to GBPUSD's own window).
      expect(points).toEqual([
        { t: 2_000, v: 52 }, // max(2000,500)=2000; 102-50=52
        { t: 3_000, v: 52 }, // max(3000,1500)=3000; 103-51=52
        { t: 4_000, v: 52 }, // max(4000,2500)=4000; 104-52=52
      ]);
    });
  });

  describe("totality: every empty-fallback branch is reachable without a throw", () => {
    it("an unrecognized source.kind (e.g. a future wire addition this build predates) degrades to an empty panel, not a throw", () => {
      const deps = makeDeps();
      const spec = makeSpec({
        // Deliberately a `PanelSource` this client doesn't know about —
        // forward-compatibility with a server that outpaces this build.
        source: {
          kind: "futureSourceKind",
        } as unknown as PanelSpecV1["source"],
        viz: { kind: "line" },
      });

      expect(() => {
        collect(composePanelStream(spec, deps));
      }).not.toThrow();
      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "line",
        series: [],
        annotations: [],
      } satisfies PanelData);
    });

    it("spread naming a symbol the source never fetched yields an empty (not a throw)", () => {
      const deps = makeDeps({
        pricing: fakePricing({ EURUSD: from([makeTick("EURUSD", 1, 0)]) }),
      });

      // Only EURUSD is in source.symbols — "GBPUSD" was never fetched, so
      // frame.series has no matching label for `b`.
      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "spread", a: "EURUSD", b: "GBPUSD" }],
        viz: { kind: "line" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "line",
        series: [],
        annotations: [],
      } satisfies PanelData);
    });

    it("window applied directly to a non-series source (table) yields an empty, not a throw", () => {
      const deps = makeDeps({ blotter: fakeBlotter(of([makeTrade({})])) });
      const spec = makeSpec({
        source: { kind: "blotter" },
        transforms: [{ kind: "window", seconds: 10 }],
        viz: { kind: "table" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "table",
        columns: [],
        rows: [],
      } satisfies PanelData);
    });

    it("returns applied directly to a non-series source (table) yields an empty, not a throw", () => {
      const deps = makeDeps({ blotter: fakeBlotter(of([makeTrade({})])) });
      const spec = makeSpec({
        source: { kind: "blotter" },
        transforms: [{ kind: "returns" }],
        viz: { kind: "table" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "table",
        columns: [],
        rows: [],
      } satisfies PanelData);
    });

    it("spread applied directly to a non-series source (table) yields an empty, not a throw", () => {
      const deps = makeDeps({ blotter: fakeBlotter(of([makeTrade({})])) });
      const spec = makeSpec({
        source: { kind: "blotter" },
        transforms: [{ kind: "spread", a: "EURUSD", b: "GBPUSD" }],
        viz: { kind: "line" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "line",
        series: [],
        annotations: [],
      } satisfies PanelData);
    });

    it("rollingVol with a degenerate (non-positive) sample window never divides by an empty slice, not a throw", () => {
      const deps = makeDeps({
        pricing: fakePricing({
          EURUSD: from([
            makeTick("EURUSD", 1, 0),
            makeTick("EURUSD", 2, 1_000),
          ]),
        }),
      });

      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "rollingVol", samples: 0 }],
        viz: { kind: "line" },
      });

      expect(() => {
        collect(composePanelStream(spec, deps));
      }).not.toThrow();
      const last = lastEmission(
        composePanelStream(spec, deps),
      ) as LinePanelData;

      // samples:0 makes every windowPoints slice empty — population stddev
      // of an empty sample set is defined here as 0.
      for (const p of last.series[0]?.points ?? []) {
        expect(p.v).toBe(0);
      }
    });

    it("returns skips a pair whose earlier tick is exactly 0 (division-by-zero guard), not a throw", () => {
      const deps = makeDeps({
        pricing: fakePricing({
          EURUSD: from([
            makeTick("EURUSD", 0, 0),
            makeTick("EURUSD", 10, 1_000),
          ]),
        }),
      });

      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "returns" }],
        viz: { kind: "line" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "line",
        series: [{ label: "EURUSD", points: [] }],
        annotations: [],
      } satisfies PanelData);
    });

    it("window applied to an already-empty-points series (from a prior returns with too few ticks) is a no-op, not a throw", () => {
      const deps = makeDeps({
        pricing: fakePricing({
          EURUSD: from([makeTick("EURUSD", 100, 0)]),
        }),
      });

      // A single tick gives `returns` nothing to pair — its output series is
      // present but empty. `window` must then handle a series whose last
      // point is undefined without throwing.
      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "returns" }, { kind: "window", seconds: 5 }],
        viz: { kind: "line" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "line",
        series: [{ label: "EURUSD", points: [] }],
        annotations: [],
      } satisfies PanelData);
    });

    it("gauge over a non-series source (table) falls back to the empty gauge placeholder", () => {
      const deps = makeDeps({ blotter: fakeBlotter(of([makeTrade({})])) });
      const spec = makeSpec({
        source: { kind: "blotter" },
        viz: { kind: "gauge" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "gauge",
        label: "",
        value: "—",
        delta: "",
        tone: "info",
      } satisfies PanelData);
    });

    it("gauge over a series whose points are empty (too few ticks for `returns`) falls back to the empty gauge placeholder", () => {
      const deps = makeDeps({
        pricing: fakePricing({
          EURUSD: from([makeTick("EURUSD", 100, 0)]),
        }),
      });

      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        transforms: [{ kind: "returns" }],
        viz: { kind: "gauge" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "gauge",
        label: "",
        value: "—",
        delta: "",
        tone: "info",
      } satisfies PanelData);
    });

    it("sparkGrid over a non-series source (table) falls back to empty cells", () => {
      const deps = makeDeps({ blotter: fakeBlotter(of([makeTrade({})])) });
      const spec = makeSpec({
        source: { kind: "blotter" },
        viz: { kind: "sparkGrid" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "sparkGrid",
        cells: [],
      } satisfies PanelData);
    });

    it("heatmap over a non-table source (series) falls back to empty rows", () => {
      const deps = makeDeps({
        pricing: fakePricing({ EURUSD: from([makeTick("EURUSD", 1, 0)]) }),
      });

      const spec = makeSpec({
        source: { kind: "fxTicks", symbols: ["EURUSD"] },
        viz: { kind: "heatmap" },
      });

      expect(lastEmission(composePanelStream(spec, deps))).toEqual({
        kind: "heatmap",
        rows: [],
      } satisfies PanelData);
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
