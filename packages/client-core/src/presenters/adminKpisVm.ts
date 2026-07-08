import type { MetricSample } from "@rtc/domain";

// Port source: packages/client-prototype/src/admin/adminVm.ts (sparkPoints,
// kpisVm, throughputVm) + adminData.ts (LAT_BUCKETS labels). The prototype
// operates on plain `number[]` series seeded by an in-file random walk; here
// the series arrive as `readonly MetricSample[]` from the real telemetry
// presenters, so the geometry/formatting math is ported verbatim onto
// `.value` extraction and the latency-bucket histogram is computed from the
// actual sample distribution instead of a fixed jittered seed. Line geometry
// is emitted as smoothed SVG path `d` strings (Catmull-Rom through cubic
// Béziers, PnlChart precedent) rather than raw polyline points, so the
// charts read as the prototype's fluid glow curves instead of jagged
// straight segments.

const SPARK_W = 100;
const SPARK_H = 28;
const SPARK_SPAN = 26;
const DELTA_LOOKBACK = 9;
const LAT_WARN = 60;
const ERR_WARN = 0.8;
const TPUT_W = 300;
const TPUT_H = 96;
const TPUT_TOP = 92;
const TPUT_SPAN = 84;

export type AdminKpiKey = "tput" | "lat" | "err" | "sess";

export interface AdminKpiVm {
  readonly key: AdminKpiKey;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly delta: string;
  readonly deltaUp: boolean;
  readonly warn: boolean;
  readonly spark: string;
}

export interface ThroughputPaths {
  readonly line: string;
  readonly area: string;
}

export interface LatBarVm {
  readonly label: string;
  readonly heightPct: number;
  readonly accent: boolean;
}

export interface KpisVmInput {
  readonly throughput: readonly MetricSample[];
  readonly latency: readonly MetricSample[];
  readonly errorRate: readonly MetricSample[];
  readonly sessions: readonly MetricSample[];
}

interface KpiCfg {
  readonly label: string;
  readonly unit: string;
  fmt(v: number): string;
  warns(v: number): boolean;
}

const KPI_ORDER: readonly AdminKpiKey[] = ["tput", "lat", "err", "sess"];

function fmtTput(v: number): string {
  return (v / 1000).toFixed(2);
}

function fmtRound(v: number): string {
  return String(Math.round(v));
}

function fmtErr(v: number): string {
  return v.toFixed(2);
}

function noWarn(): boolean {
  return false;
}

function warnLat(v: number): boolean {
  return v > LAT_WARN;
}

function warnErr(v: number): boolean {
  return v > ERR_WARN;
}

// PROTO adminVm.ts L1375-1378 (KPI_CFG): per-metric label, unit, formatter and
// warn threshold, ported verbatim.
const KPI_CFG: Record<AdminKpiKey, KpiCfg> = {
  tput: { label: "Throughput", unit: "k msg/s", fmt: fmtTput, warns: noWarn },
  lat: { label: "P99 Latency", unit: "ms", fmt: fmtRound, warns: warnLat },
  err: { label: "Error Rate", unit: "%", fmt: fmtErr, warns: warnErr },
  sess: { label: "Active Sessions", unit: "", fmt: fmtRound, warns: noWarn },
};

function valuesOf(samples: readonly MetricSample[]): readonly number[] {
  return samples.map((s) => {
    return s.value;
  });
}

function seriesFor(
  key: AdminKpiKey,
  input: KpisVmInput,
): readonly MetricSample[] {
  switch (key) {
    case "tput":
      return input.throughput;
    case "lat":
      return input.latency;
    case "err":
      return input.errorRate;
    case "sess":
      return input.sessions;
  }
}

// x-position for sample `i` of `len` spread evenly across `width`; a
// single-sample series collapses to the origin rather than dividing by zero.
function xAt(i: number, len: number, width: number): number {
  if (len <= 1) return 0;
  return (i / (len - 1)) * width;
}

/** One chart-space coordinate fed to smoothPath. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

function fmt(n: number): string {
  return n.toFixed(1);
}

// Catmull-Rom-through-cubic-Bézier smoothing (standard 1/6-tension formula,
// ported from PnlChart): each segment's control points are derived from the
// neighbours either side of the segment's endpoints, so the curve passes
// through every data point while staying tangent-continuous. Unlike the
// PnlChart original, control-point y values are clamped into the chart box
// [0, boxHeight] so the curve never overshoots below the baseline or above
// the top at sharp turns.
export function smoothPath(
  points: readonly ChartPoint[],
  boxHeight: number,
): string {
  if (points.length === 0) return "";

  const first = points[0];
  let d = `M${fmt(first.x)},${fmt(first.y)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clampControlY(p1.y + (p2.y - p0.y) / 6, boxHeight);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clampControlY(p2.y - (p3.y - p1.y) / 6, boxHeight);
    d += ` C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }

  return d;
}

// The overshoot clamp: control points stay inside the vertical chart box so
// the smoothed curve never dips below the baseline or rises above the top.
function clampControlY(y: number, boxHeight: number): number {
  return Math.max(0, Math.min(boxHeight, y));
}

// PROTO adminVm.ts L1373: normalise a series over a 100×28 box, inverted so
// peaks sit near the top, emitted as a smoothed path `d`. Empty series render
// nothing.
export function sparkPath(values: readonly number[]): string {
  if (values.length === 0) return "";
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  const points = values.map((v, i) => {
    return {
      x: xAt(i, values.length, SPARK_W),
      y: SPARK_H - ((v - mn) / rg) * SPARK_SPAN,
    };
  });
  return smoothPath(points, SPARK_H);
}

// PROTO adminVm.ts L1374: current value, delta vs the lookback sample, warn
// state, spark. An empty series reads as a flat zero (no NaN in the output).
export function kpisVm(input: KpisVmInput): readonly AdminKpiVm[] {
  return KPI_ORDER.map((key) => {
    const values = valuesOf(seriesFor(key, input));
    const cfg = KPI_CFG[key];
    const cur = values.length > 0 ? values[values.length - 1] : 0;
    const past =
      values.length > 0
        ? (values[values.length - DELTA_LOOKBACK] ?? values[0])
        : 0;
    const dl = cur - past;
    const deltaUp = dl >= 0;
    return {
      key,
      label: cfg.label,
      value: cfg.fmt(cur),
      unit: cfg.unit,
      delta: `${deltaUp ? "▲ +" : "▼ "}${cfg.fmt(Math.abs(dl))}`,
      deltaUp,
      warn: cfg.warns(cur),
      spark: sparkPath(values),
    };
  });
}

// PROTO adminVm.ts L1380: the throughput series as a smoothed SVG line path
// plus a closed gradient area over a 300×96 box. An empty series closes to a
// flat baseline.
export function throughputPaths(
  samples: readonly MetricSample[],
): ThroughputPaths {
  const values = valuesOf(samples);

  if (values.length === 0) {
    return { line: "", area: `M0,${TPUT_H} L${TPUT_W},${TPUT_H} Z` };
  }

  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  const points = values.map((v, i) => {
    return {
      x: xAt(i, values.length, TPUT_W),
      y: TPUT_TOP - ((v - mn) / rg) * TPUT_SPAN,
    };
  });
  const line = smoothPath(points, TPUT_H);
  return {
    line,
    area: `${line} L${TPUT_W},${TPUT_H} L0,${TPUT_H} Z`,
  };
}

// PROTO adminData.ts L1381 (LAT_BUCKETS labels): 6 fixed latency buckets, in
// milliseconds. Boundary edges land in the LOWER bucket (half-open on the
// high side: `value <= edge` claims the edge), e.g. exactly 10ms is `<10`,
// exactly 25ms is `10-25`. Unlike the prototype's static jittered seed, the
// bar heights and the accent (modal) bucket are computed from the actual
// sample distribution.
const LAT_BUCKET_LABELS: readonly string[] = [
  "<10",
  "10-25",
  "25-50",
  "50-80",
  "80-150",
  "150+",
];
const LAT_BUCKET_EDGES: readonly number[] = [10, 25, 50, 80, 150];

function bucketIndexFor(value: number): number {
  for (let i = 0; i < LAT_BUCKET_EDGES.length; i += 1) {
    if (value <= LAT_BUCKET_EDGES[i]) return i;
  }

  return LAT_BUCKET_EDGES.length;
}

export function latencyBuckets(
  samples: readonly MetricSample[],
): readonly LatBarVm[] {
  const counts = LAT_BUCKET_LABELS.map(() => {
    return 0;
  });

  for (const s of samples) {
    counts[bucketIndexFor(s.value)] += 1;
  }

  const maxCount = Math.max(...counts);
  const modalIndex = maxCount > 0 ? counts.indexOf(maxCount) : -1;
  return LAT_BUCKET_LABELS.map((label, i) => {
    return {
      label,
      heightPct: maxCount > 0 ? (counts[i] / maxCount) * 100 : 0,
      accent: i === modalIndex,
    };
  });
}
