import type { MetricSample } from "@rtc/domain";

// Port source: packages/client-prototype/src/admin/adminVm.ts (sparkPoints,
// kpisVm, throughputVm) + adminData.ts (LAT_BUCKETS labels). The prototype
// operates on plain `number[]` series seeded by an in-file random walk; here
// the series arrive as `readonly MetricSample[]` from the real telemetry
// presenters, so the geometry/formatting math is ported verbatim onto
// `.value` extraction and the latency-bucket histogram is computed from the
// actual sample distribution instead of a fixed jittered seed.

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

// PROTO adminVm.ts L1373: normalise a series into "x,y x,y …" over a 100×28
// box, inverted so peaks sit near the top. Empty series render nothing.
export function sparkPoints(values: readonly number[]): string {
  if (values.length === 0) return "";
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  return values
    .map((v, i) => {
      const x = xAt(i, values.length, SPARK_W).toFixed(1);
      const y = (SPARK_H - ((v - mn) / rg) * SPARK_SPAN).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
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
      spark: sparkPoints(values),
    };
  });
}

// PROTO adminVm.ts L1380: the throughput series as an SVG polyline + a closed
// gradient area over a 300×96 box. An empty series closes to a flat baseline.
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
  const pts = values.map((v, i) => {
    const x = xAt(i, values.length, TPUT_W).toFixed(1);
    const y = (TPUT_TOP - ((v - mn) / rg) * TPUT_SPAN).toFixed(1);
    return `${x},${y}`;
  });
  return {
    line: pts.join(" "),
    area: `M0,${TPUT_H} ${pts.join(" ")} L${TPUT_W},${TPUT_H} Z`,
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
