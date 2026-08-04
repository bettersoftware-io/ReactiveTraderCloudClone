import { combineLatest, type Observable, of, shareReplay } from "rxjs";
import { map, scan } from "rxjs/operators";

import {
  type AnalyticsPort,
  AnalyticsUseCase,
  type BlotterPort,
  formatPnlHeadline,
  type PositionUpdates,
  type PriceTick,
  type PricingPort,
  type ReferenceDataPort,
  TradeBlotterUseCase,
  TradeStatus,
} from "@rtc/domain";
import type {
  PanelAnnotation,
  PanelSource,
  PanelSpecV1,
  PanelTransform,
  PanelViz,
} from "@rtc/shared";

/** A single numeric sample on a line/spark series — `t` is a timestamp in ms
 * (whatever epoch the underlying tick carries), `v` its value. */
export type PanelPoint = { readonly t: number; readonly v: number };

export type PanelTone = "up" | "down" | "flat" | "info" | "warn" | "danger";

/** The rendered shape a `JarvisPanelVm.data$` carries — one variant per
 * `PanelViz.kind`, so the UI shell can switch on `.kind` without a further
 * lookup. Every render path is TOTAL (see `composePanelStream`'s doc): a
 * transform chain that doesn't make sense for its source, or a viz that
 * doesn't make sense for its data, yields the EMPTY form of its own kind
 * rather than throwing or omitting a field. */
export type PanelData =
  | {
      readonly kind: "line";
      readonly series: readonly {
        readonly label: string;
        readonly points: readonly PanelPoint[];
      }[];
      readonly annotations: readonly PanelAnnotation[];
    }
  | {
      readonly kind: "table";
      readonly columns: readonly string[];
      readonly rows: readonly {
        readonly cells: readonly string[];
        readonly tone: PanelTone;
      }[];
    }
  | {
      readonly kind: "gauge";
      readonly label: string;
      readonly value: string;
      readonly delta: string;
      readonly tone: PanelTone;
    }
  | {
      readonly kind: "sparkGrid";
      readonly cells: readonly {
        readonly label: string;
        readonly points: readonly number[];
        readonly change: string;
        readonly tone: PanelTone;
      }[];
    }
  | {
      readonly kind: "heatmap";
      readonly rows: readonly {
        readonly label: string;
        readonly cells: readonly {
          readonly label: string;
          /** -1..1 */
          readonly intensity: number;
          readonly text: string;
        }[];
      }[];
    };

/** The subset of domain ports a `PanelSpecV1`'s `source` can read from —
 * copied from `ScriptedJarvisEngine`'s `ScriptedJarvisDeps` (minus
 * `execution`/`instantReveal$`, which no panel source needs). */
export interface PanelStreamDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
}

/** In-memory safety cap on any one series' accumulated point count — applied
 * where points ACCUMULATE over an unbounded live stream (`fxTicks`) or get
 * read from a bounded-but-possibly-long history (`priceHistory`); every
 * transform downstream can only ever shrink a series, never grow it, so
 * nothing else needs its own cap. */
export const MAX_POINTS_PER_SERIES = 600;

/** Recent-trades cap for the `blotter` source's table — same in-memory-safety
 * spirit as `MAX_POINTS_PER_SERIES`, sized for "what fits a panel" rather than
 * "the whole blotter". */
const RECENT_TRADES_LIMIT = 20;

const ANALYTICS_TABLE_COLUMNS = [
  "Symbol",
  "P&L",
  "Base Amt",
  "Counter Amt",
] as const;

const BLOTTER_TABLE_COLUMNS = [
  "Trade",
  "Pair",
  "Notional",
  "Rate",
  "Status",
] as const;

/** Scale a raw numeric magnitude (e.g. a P&L dollar figure) down to a
 * heatmap's -1..1 intensity range. Deliberately generous (a $10k swing
 * already saturates) — desk P&L panels are meant to pop, not sit muted. */
const HEATMAP_INTENSITY_SCALE = 10_000;

function capPoints(points: readonly PanelPoint[]): readonly PanelPoint[] {
  if (points.length <= MAX_POINTS_PER_SERIES) {
    return points;
  }

  return points.slice(points.length - MAX_POINTS_PER_SERIES);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function toneFromSign(delta: number): PanelTone {
  if (delta > 0) {
    return "up";
  }

  if (delta < 0) {
    return "down";
  }

  return "flat";
}

function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

function formatGaugeValue(v: number): string {
  return v.toFixed(4);
}

function formatSignedDelta(delta: number): string {
  return delta >= 0 ? `+${delta.toFixed(4)}` : delta.toFixed(4);
}

interface NamedSeries {
  readonly label: string;
  readonly points: readonly PanelPoint[];
}

/** One `table`-shaped source row, carrying its own numeric sort keys so a
 * later `topN` transform (`by: "value" | "change"`) can order it without
 * re-parsing the display cells. */
interface TableRowInternal {
  readonly cells: readonly string[];
  readonly tone: PanelTone;
  readonly value: number;
  readonly change: number;
}

/** The interpreter's internal working representation, threaded through
 * `source → transforms → viz`. `"empty"` is the explicit "this
 * transform/viz doesn't make sense for what came before it" marker — once a
 * frame goes empty it STAYS empty (totality: no throw, no silent
 * reinterpretation), and every viz renderer maps it to its own empty
 * `PanelData` shape. */
type Frame =
  | { readonly kind: "series"; readonly series: readonly NamedSeries[] }
  | {
      readonly kind: "table";
      readonly columns: readonly string[];
      readonly rows: readonly TableRowInternal[];
    }
  | { readonly kind: "empty" };

function accumulatePoints$(
  ticks$: Observable<PriceTick>,
): Observable<readonly PanelPoint[]> {
  return ticks$.pipe(
    scan(
      (points: readonly PanelPoint[], tick): readonly PanelPoint[] => {
        return capPoints([
          ...points,
          { t: tick.creationTimestamp, v: tick.mid },
        ]);
      },
      [] as readonly PanelPoint[],
    ),
  );
}

function fxTicksFrame$(
  symbols: readonly string[],
  pricing: PricingPort,
): Observable<Frame> {
  const perSymbol$ = symbols.map((symbol) => {
    return accumulatePoints$(pricing.getPriceUpdates(symbol)).pipe(
      map((points): NamedSeries => {
        return { label: symbol, points };
      }),
    );
  });

  return combineLatest(perSymbol$).pipe(
    map((series): Frame => {
      return { kind: "series", series };
    }),
  );
}

function priceHistoryFrame$(
  symbols: readonly string[],
  pricing: PricingPort,
): Observable<Frame> {
  const perSymbol$ = symbols.map((symbol) => {
    return pricing.getPriceHistory(symbol).pipe(
      map((ticks): NamedSeries => {
        const points = capPoints(
          ticks.map((t) => {
            return { t: t.creationTimestamp, v: t.mid };
          }),
        );
        return { label: symbol, points };
      }),
    );
  });

  return combineLatest(perSymbol$).pipe(
    map((series): Frame => {
      return { kind: "series", series };
    }),
  );
}

function toPositionRow(
  position: PositionUpdates["currentPositions"][number],
): TableRowInternal {
  return {
    cells: [
      position.symbol,
      formatPnlHeadline(position.basePnl),
      formatThousands(position.baseTradedAmount),
      formatThousands(position.counterTradedAmount),
    ],
    tone: toneFromSign(position.basePnl),
    value: position.basePnl,
    change: position.basePnl,
  };
}

function analyticsFrame$(analytics: AnalyticsPort): Observable<Frame> {
  return new AnalyticsUseCase(analytics).execute().pipe(
    map((updates): Frame => {
      return {
        kind: "table",
        columns: [...ANALYTICS_TABLE_COLUMNS],
        rows: updates.currentPositions.map(toPositionRow),
      };
    }),
  );
}

function toneFromTradeStatus(status: TradeStatus): PanelTone {
  switch (status) {
    case TradeStatus.Done:
      return "up";
    case TradeStatus.Rejected:
      return "danger";
    case TradeStatus.Pending:
      return "info";

    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function blotterFrame$(blotter: BlotterPort): Observable<Frame> {
  return new TradeBlotterUseCase(blotter).execute().pipe(
    map((trades): Frame => {
      const recent = [...trades]
        .sort((a, b) => {
          return b.tradeId - a.tradeId;
        })
        .slice(0, RECENT_TRADES_LIMIT);

      const rows = recent.map((trade): TableRowInternal => {
        return {
          cells: [
            trade.tradeName,
            trade.currencyPair,
            formatThousands(trade.notional),
            trade.spotRate.toString(),
            trade.status,
          ],
          tone: toneFromTradeStatus(trade.status),
          value: trade.notional,
          change: trade.spotRate,
        };
      });
      return { kind: "table", columns: [...BLOTTER_TABLE_COLUMNS], rows };
    }),
  );
}

/** Compile-time-only exhaustiveness assertion that still degrades sanely at
 * runtime: unlike `const _exhaustive: never = x; return _exhaustive;` (which
 * would hand a non-`Frame` value straight back to a caller typed to expect
 * one — a real crash risk the moment anything downstream calls `.pipe()` on
 * it), this keeps the "TS errors if a new `PanelSource` kind goes
 * unhandled" safety net while returning a genuine empty `Frame` if an
 * unrecognized `kind` ever reaches here at runtime anyway (e.g. a future
 * server sending a source kind this client build predates). */
function unknownSourceFrame(_source: never): Frame {
  return { kind: "empty" };
}

function sourceFrame$(
  source: PanelSource,
  deps: PanelStreamDeps,
): Observable<Frame> {
  switch (source.kind) {
    case "fxTicks":
      return fxTicksFrame$(source.symbols, deps.pricing);
    case "priceHistory":
      return priceHistoryFrame$(source.symbols, deps.pricing);
    case "analytics":
      return analyticsFrame$(deps.analytics);
    case "blotter":
      return blotterFrame$(deps.blotter);

    default:
      return of<Frame>(unknownSourceFrame(source));
  }
}

function applyWindow(frame: Frame, seconds: number): Frame {
  if (frame.kind !== "series") {
    return { kind: "empty" };
  }

  const cutoffMs = seconds * 1000;
  const series = frame.series.map((s): NamedSeries => {
    const last = s.points[s.points.length - 1];

    if (!last) {
      return s;
    }

    const cutoff = last.t - cutoffMs;
    return {
      label: s.label,
      points: s.points.filter((p) => {
        return p.t >= cutoff;
      }),
    };
  });
  return { kind: "series", series };
}

function applyReturns(frame: Frame): Frame {
  if (frame.kind !== "series") {
    return { kind: "empty" };
  }

  const series = frame.series.map((s): NamedSeries => {
    const points: PanelPoint[] = [];

    for (let i = 1; i < s.points.length; i += 1) {
      const prev = s.points[i - 1];
      const cur = s.points[i];

      if (!prev || !cur || prev.v === 0) {
        continue;
      }

      points.push({ t: cur.t, v: (cur.v - prev.v) / prev.v });
    }

    return { label: s.label, points };
  });
  return { kind: "series", series };
}

function stddev(values: readonly number[]): number {
  const n = values.length;

  if (n === 0) {
    return 0;
  }

  const mean =
    values.reduce((sum, v) => {
      return sum + v;
    }, 0) / n;

  const variance =
    values.reduce((sum, v) => {
      return sum + (v - mean) ** 2;
    }, 0) / n;
  return Math.sqrt(variance);
}

function applyRollingVol(frame: Frame, samples: number): Frame {
  if (frame.kind !== "series") {
    return { kind: "empty" };
  }

  const series = frame.series.map((s): NamedSeries => {
    const points: PanelPoint[] = [];

    for (let i = samples - 1; i < s.points.length; i += 1) {
      const windowPoints = s.points.slice(i - samples + 1, i + 1);
      const values = windowPoints.map((p) => {
        return p.v;
      });
      const t = s.points[i]?.t;

      if (t === undefined) {
        continue;
      }

      points.push({ t, v: stddev(values) });
    }

    return { label: s.label, points };
  });
  return { kind: "series", series };
}

/**
 * Pairs `seriesA`/`seriesB` positionally over their trailing `len =
 * min(lenA, lenB)` points — i.e. each series' NEWEST `len` points, not its
 * oldest. Two independently-accumulated fxTicks series tick at different
 * rates (a quiet pair ticks far less often than a busy one), so pairing from
 * the START (index 0 of each) would line up the busy series' STALE early
 * history against the quiet series' full, still-current window — the busier
 * side's "point 0" can be many minutes older than the quiet side's. Pairing
 * from the END instead means index `len-1` on both sides is always each
 * series' own latest tick, and earlier indices step back in lockstep from
 * there — the newest pairing is always the two series' most recent data,
 * which is what a spread panel is for. Each pair is stamped with the NEWER
 * of its two source timestamps (whichever side ticked more recently at that
 * position), since that's the instant the pair actually became valid.
 */
function applySpread(frame: Frame, a: string, b: string): Frame {
  if (frame.kind !== "series") {
    return { kind: "empty" };
  }

  const seriesA = frame.series.find((s) => {
    return s.label === a;
  });

  const seriesB = frame.series.find((s) => {
    return s.label === b;
  });

  if (!seriesA || !seriesB) {
    return { kind: "empty" };
  }

  const lenA = seriesA.points.length;
  const lenB = seriesB.points.length;
  const len = Math.min(lenA, lenB);
  const points: PanelPoint[] = [];

  for (let i = 0; i < len; i += 1) {
    const pa = seriesA.points[lenA - len + i];
    const pb = seriesB.points[lenB - len + i];

    if (!pa || !pb) {
      continue;
    }

    points.push({ t: Math.max(pa.t, pb.t), v: pa.v - pb.v });
  }

  return { kind: "series", series: [{ label: `${a}-${b}`, points }] };
}

function applyTopN(frame: Frame, n: number, by: "value" | "change"): Frame {
  if (frame.kind !== "table") {
    return { kind: "empty" };
  }

  const sorted = [...frame.rows].sort((r1, r2) => {
    const v1 = by === "value" ? r1.value : r1.change;
    const v2 = by === "value" ? r2.value : r2.change;
    return v2 - v1;
  });
  return { kind: "table", columns: frame.columns, rows: sorted.slice(0, n) };
}

function applyTransform(frame: Frame, transform: PanelTransform): Frame {
  if (frame.kind === "empty") {
    return frame;
  }

  switch (transform.kind) {
    case "window":
      return applyWindow(frame, transform.seconds);
    case "returns":
      return applyReturns(frame);
    case "rollingVol":
      return applyRollingVol(frame, transform.samples);
    case "spread":
      return applySpread(frame, transform.a, transform.b);
    case "topN":
      return applyTopN(frame, transform.n, transform.by);

    default: {
      const _exhaustive: never = transform;
      return _exhaustive;
    }
  }
}

function renderLine(
  frame: Frame,
  annotations: readonly PanelAnnotation[],
): PanelData {
  if (frame.kind !== "series") {
    return { kind: "line", series: [], annotations };
  }

  return {
    kind: "line",
    series: frame.series.map((s) => {
      return { label: s.label, points: s.points };
    }),
    annotations,
  };
}

function renderTable(frame: Frame): PanelData {
  if (frame.kind !== "table") {
    return { kind: "table", columns: [], rows: [] };
  }

  return {
    kind: "table",
    columns: frame.columns,
    rows: frame.rows.map((r) => {
      return { cells: r.cells, tone: r.tone };
    }),
  };
}

const EMPTY_GAUGE: PanelData = {
  kind: "gauge",
  label: "",
  value: "—",
  delta: "",
  tone: "info",
};

function renderGauge(frame: Frame, label: string): PanelData {
  if (frame.kind !== "series") {
    return EMPTY_GAUGE;
  }

  const series = frame.series[frame.series.length - 1];

  if (!series || series.points.length === 0) {
    return EMPTY_GAUGE;
  }

  const last = series.points[series.points.length - 1];
  const prev = series.points[series.points.length - 2];

  if (!last) {
    return EMPTY_GAUGE;
  }

  const delta = prev ? last.v - prev.v : 0;
  return {
    kind: "gauge",
    label: label.length > 0 ? label : series.label,
    value: formatGaugeValue(last.v),
    delta: formatSignedDelta(delta),
    tone: toneFromSign(delta),
  };
}

function renderSparkGrid(frame: Frame): PanelData {
  if (frame.kind !== "series") {
    return { kind: "sparkGrid", cells: [] };
  }

  const cells = frame.series.map((s) => {
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    const change = first && last ? last.v - first.v : 0;
    return {
      label: s.label,
      points: s.points.map((p) => {
        return p.v;
      }),
      change: formatSignedDelta(change),
      tone: toneFromSign(change),
    };
  });
  return { kind: "sparkGrid", cells };
}

function renderHeatmap(frame: Frame): PanelData {
  if (frame.kind !== "table") {
    return { kind: "heatmap", rows: [] };
  }

  const rows = frame.rows.map((r) => {
    const intensity = clamp(r.value / HEATMAP_INTENSITY_SCALE, -1, 1);
    return {
      label: r.cells[0] ?? "",
      cells: [
        {
          label: r.cells[1] ?? "value",
          intensity,
          text: r.cells[1] ?? "",
        },
      ],
    };
  });
  return { kind: "heatmap", rows };
}

function renderViz(
  frame: Frame,
  viz: PanelViz,
  annotations: readonly PanelAnnotation[],
): PanelData {
  switch (viz.kind) {
    case "line":
      return renderLine(frame, annotations);
    case "table":
      return renderTable(frame);
    case "gauge":
      return renderGauge(frame, viz.label ?? "");
    case "sparkGrid":
      return renderSparkGrid(frame);
    case "heatmap":
      return renderHeatmap(frame);

    default: {
      const _exhaustive: never = viz;
      return _exhaustive;
    }
  }
}

/**
 * Interprets one `PanelSpecV1` into a live `PanelData` stream: reads
 * `spec.source` off the matching domain port, folds `spec.transforms` over it
 * in order, then renders `spec.viz`. Pure rxjs composition — no timers of its
 * own beyond whatever the source ports themselves emit on.
 *
 * TOTAL by construction: a transform that doesn't apply to what came before
 * it (e.g. `rollingVol` after a `blotter`/table source, or `topN` after a
 * `fxTicks`/series source) collapses the working frame to the internal
 * `"empty"` marker rather than throwing, and every `viz` renderer maps that
 * (or a viz that doesn't apply to what IS there) to the empty form of its own
 * `PanelData` kind — an empty series/rows/cells array, or a placeholder
 * gauge. A caller never needs to catch.
 *
 * `shareReplay({ bufferSize: 1, refCount: true })`: one subscription per
 * panel is shared across every current subscriber (so N UI readers of the
 * same panel's `data$` cost the source ports exactly one subscription), and
 * `refCount: true` tears that subscription down once the last reader
 * unsubscribes — `JarvisPanelsPresenter` relies on this to release a
 * dismissed panel's port streams (see its own doc).
 */
export function composePanelStream(
  spec: PanelSpecV1,
  deps: PanelStreamDeps,
): Observable<PanelData> {
  const annotations = spec.annotations ?? [];

  return sourceFrame$(spec.source, deps).pipe(
    map((frame) => {
      return spec.transforms.reduce(applyTransform, frame);
    }),
    map((frame) => {
      return renderViz(frame, spec.viz, annotations);
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}
