import { SERVICES } from "#/admin/adminData";
import type { AdminKpi, AdminMetrics, MetricKey, Service } from "#/admin/types";

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
const SVC_LAT_MAX = 60;
const KPI_ORDER: MetricKey[] = ["tput", "lat", "err", "sess"];

interface KpiCfg {
  label: string;
  unit: string;
  fmt(v: number): string;
  warns(v: number): boolean;
}

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

// PROTO L1375-1378: per-metric label, unit, formatter and warn threshold.
const KPI_CFG: Record<MetricKey, KpiCfg> = {
  tput: { label: "Throughput", unit: "k msg/s", fmt: fmtTput, warns: noWarn },
  lat: { label: "P99 Latency", unit: "ms", fmt: fmtRound, warns: warnLat },
  err: { label: "Error Rate", unit: "%", fmt: fmtErr, warns: warnErr },
  sess: { label: "Active Sessions", unit: "", fmt: fmtRound, warns: noWarn },
};

// PROTO L1373: normalise a series into "x,y x,y …" over a 100×28 box, inverted
// so peaks sit near the top.
export function sparkPoints(arr: number[]): string {
  const mn = Math.min(...arr);
  const mx = Math.max(...arr);
  const rg = mx - mn || 1;
  return arr
    .map((v, i) => {
      const x = ((i / (arr.length - 1)) * SPARK_W).toFixed(1);
      const y = (SPARK_H - ((v - mn) / rg) * SPARK_SPAN).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
}

// PROTO L1374: current value, delta vs the lookback sample, warn state, spark.
export function kpisVm(metrics: AdminMetrics): AdminKpi[] {
  return KPI_ORDER.map((key) => {
    const arr = metrics[key];
    const cfg = KPI_CFG[key];
    const cur = arr[arr.length - 1];
    const past = arr[arr.length - DELTA_LOOKBACK] ?? arr[0];
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
      spark: sparkPoints(arr),
    };
  });
}

export interface ThroughputPaths {
  line: string;
  area: string;
}

// PROTO L1380: the throughput series as an SVG polyline + a closed gradient area
// over a 300×96 box.
export function throughputVm(tput: number[]): ThroughputPaths {
  const mn = Math.min(...tput);
  const mx = Math.max(...tput);
  const rg = mx - mn || 1;
  const pts = tput.map((v, i) => {
    const x = ((i / (tput.length - 1)) * TPUT_W).toFixed(1);
    const y = (TPUT_TOP - ((v - mn) / rg) * TPUT_SPAN).toFixed(1);
    return `${x},${y}`;
  });
  return {
    line: pts.join(" "),
    area: `M0,${TPUT_H} ${pts.join(" ")} L${TPUT_W},${TPUT_H} Z`,
  };
}

// PROTO L1384: derive the latency label and a bar % from the static seeds.
export function servicesVm(): Service[] {
  return SERVICES.map((s) => {
    return {
      name: s.name,
      status: s.status,
      up: s.up,
      lat: `${s.lv}ms`,
      barPct: Math.min(100, (s.lv / SVC_LAT_MAX) * 100),
    };
  });
}
