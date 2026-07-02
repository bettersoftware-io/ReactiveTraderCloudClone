export type Severity = "INFO" | "WARN" | "ERROR";

export type MetricKey = "tput" | "lat" | "err" | "sess";

export type AdminMetrics = Record<MetricKey, number[]>;

export interface AdminKpi {
  key: MetricKey;
  label: string;
  value: string;
  unit: string;
  delta: string;
  deltaUp: boolean;
  warn: boolean;
  spark: string;
}

export interface Service {
  name: string;
  status: "ONLINE" | "DEGRADED";
  up: string;
  lat: string;
  barPct: number;
}

export interface AdminEvent {
  id: number;
  t: string;
  sev: Severity;
  svc: string;
  msg: string;
}

export interface LatBar {
  label: string;
  heightPct: number;
  accent: boolean;
}

export interface ServiceSeed {
  name: string;
  status: "ONLINE" | "DEGRADED";
  up: string;
  lv: number;
}

export interface EventTemplate {
  sev: Severity;
  svc: string;
  msg: string;
}
