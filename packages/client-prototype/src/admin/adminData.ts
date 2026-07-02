import type {
  AdminEvent,
  AdminMetrics,
  EventTemplate,
  LatBar,
  MetricKey,
  ServiceSeed,
} from "#/admin/types";

export const SERIES_LEN = 48;
export const TICK_MS = 850;
export const EVENT_CAP = 30;
export const EVENT_EVERY_TICKS = 4;

export const METRIC_KEYS: MetricKey[] = ["tput", "lat", "err", "sess"];

interface MetricCfg {
  center: number;
  spread: number;
  step: number;
  min: number;
  max: number;
}

// PROTO L825 seeds + L1137 per-tick step/bounds, verbatim.
export const METRIC_CFG: Record<MetricKey, MetricCfg> = {
  tput: { center: 1200, spread: 160, step: 150, min: 600, max: 2200 },
  lat: { center: 42, spread: 9, step: 7, min: 8, max: 90 },
  err: { center: 0.4, spread: 0.18, step: 0.16, min: 0, max: 2.2 },
  sess: { center: 1280, spread: 36, step: 28, min: 900, max: 1800 },
};

// PROTO L1381: 6 latency buckets [label, base height %]; index 2 is the accent bar.
const LAT_BUCKETS: [string, number][] = [
  ["<10", 14],
  ["10-25", 40],
  ["25-50", 76],
  ["50-80", 46],
  ["80-150", 20],
  ["150+", 6],
];
const ACCENT_BUCKET = 2;

// PROTO L1384: static service health seeds; colour + bar width derived in adminVm.
export const SERVICES: ServiceSeed[] = [
  { name: "PRICING ENGINE", status: "ONLINE", up: "99.99%", lv: 8 },
  { name: "EXECUTION", status: "ONLINE", up: "99.98%", lv: 14 },
  { name: "BLOTTER STREAM", status: "ONLINE", up: "100%", lv: 6 },
  { name: "EQUITIES FEED", status: "ONLINE", up: "99.96%", lv: 10 },
  { name: "REFERENCE DATA", status: "DEGRADED", up: "99.40%", lv: 48 },
  { name: "CREDIT RFQ", status: "ONLINE", up: "99.97%", lv: 12 },
];

// PROTO L794-798: the initial event log (feed seed).
export const SEED_EVENTS: Omit<AdminEvent, "id">[] = [
  {
    t: "09:46:12",
    sev: "INFO",
    svc: "analytics",
    msg: "Snapshot recomputed in 38ms",
  },
  {
    t: "09:45:50",
    sev: "WARN",
    svc: "refdata",
    msg: "Latency 48ms exceeds 40ms SLO",
  },
  {
    t: "09:44:03",
    sev: "ERROR",
    svc: "refdata",
    msg: "Upstream timeout · retry 1/3 scheduled",
  },
  {
    t: "09:43:21",
    sev: "INFO",
    svc: "pricing",
    msg: "Subscribed 8 instruments",
  },
  {
    t: "09:42:08",
    sev: "INFO",
    svc: "execution",
    msg: "Fill confirmed · EURUSD 5M",
  },
  {
    t: "09:41:55",
    sev: "INFO",
    svc: "analytics",
    msg: "P&L snapshot persisted",
  },
];

// Deviation §3.2: the prototype feed is fed by cross-screen FX activity; the
// self-contained module streams from this fixed telemetry pool instead.
export const EVENT_POOL: EventTemplate[] = [
  { sev: "INFO", svc: "pricing", msg: "Subscribed 8 instruments" },
  { sev: "INFO", svc: "analytics", msg: "Snapshot recomputed in 38ms" },
  { sev: "WARN", svc: "refdata", msg: "Latency 48ms exceeds 40ms SLO" },
  { sev: "INFO", svc: "execution", msg: "Order acked in 12ms" },
  { sev: "WARN", svc: "gateway", msg: "Reconnect backoff 1 scheduled" },
  { sev: "ERROR", svc: "refdata", msg: "Upstream timeout · retry 1/3" },
  { sev: "INFO", svc: "blotter", msg: "Stream heartbeat ok" },
];

// PROTO L809: a length-n random walk around `center`, each step ±spread/2,
// floored at 0. RNG injected so smokes are deterministic.
export function gs(
  n: number,
  center: number,
  spread: number,
  rng: () => number,
): number[] {
  const out: number[] = [];
  let v = center;

  for (let i = 0; i < n; i += 1) {
    v = Math.max(0, v + (rng() - 0.5) * spread);

    out.push(v);
  }

  return out;
}

// PROTO L1136: drop the oldest sample, append a clamped ±step/2 random walk
// from the last value (3-dp rounded).
export function stepSeries(
  arr: number[],
  step: number,
  min: number,
  max: number,
  rng: () => number,
): number[] {
  const v = arr[arr.length - 1];
  let nv = v + (rng() - 0.5) * step;
  nv = Math.max(min, Math.min(max, nv));
  return [...arr.slice(1), +nv.toFixed(3)];
}

export function seedMetrics(rng: () => number): AdminMetrics {
  const out = {} as AdminMetrics;

  for (const key of METRIC_KEYS) {
    const cfg = METRIC_CFG[key];

    out[key] = gs(SERIES_LEN, cfg.center, cfg.spread, rng);
  }

  return out;
}

export function stepMetrics(
  metrics: AdminMetrics,
  rng: () => number,
): AdminMetrics {
  const out = {} as AdminMetrics;

  for (const key of METRIC_KEYS) {
    const cfg = METRIC_CFG[key];

    out[key] = stepSeries(metrics[key], cfg.step, cfg.min, cfg.max, rng);
  }

  return out;
}

// Deviation §3.1: the prototype re-jitters each render; we seed once from the
// frozen RNG for render purity. Height = base + (rng*8 - 4), floored at 4.
export function seedLatBars(rng: () => number): LatBar[] {
  return LAT_BUCKETS.map(([label, base], i) => {
    const heightPct = Math.max(4, base + (rng() * 8 - 4));
    return { label, heightPct, accent: i === ACCENT_BUCKET };
  });
}
