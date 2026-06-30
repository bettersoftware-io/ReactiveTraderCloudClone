export interface Prefs {
  animatedBg: boolean;
  reduceMotion: boolean;
  glassBlur: boolean;
  showGrid: boolean;
  scanlines: boolean;
  density: string;
  fontFace: string;
  uiScale: number;
  confirmExec: boolean;
  oneClick: boolean;
  execSound: boolean;
  precision: string;
  desktopAlerts: boolean;
  priceAlerts: boolean;
  marketNews: boolean;
  refreshRate: string;
  timezone: string;
  heartbeat: boolean;
  telemetry: boolean;
  crashReports: boolean;
  betaModules: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  animatedBg: false,
  reduceMotion: false,
  glassBlur: true,
  showGrid: true,
  scanlines: true,
  density: "Comfortable",
  fontFace: "Orbitron",
  uiScale: 100,
  confirmExec: true,
  oneClick: false,
  execSound: true,
  precision: "5 dp",
  desktopAlerts: true,
  priceAlerts: false,
  marketNews: true,
  refreshRate: "250 ms",
  timezone: "UTC",
  heartbeat: true,
  telemetry: false,
  crashReports: true,
  betaModules: false,
};

export type SegmentKey =
  | "density"
  | "fontFace"
  | "precision"
  | "refreshRate"
  | "timezone";

// label groups (PROTO 1414) keyed by the Prefs field they set (PROTO 1415 segKey).
export const SEGMENT_DEFS: Record<SegmentKey, string[]> = {
  density: ["Comfortable", "Compact"],
  fontFace: ["Orbitron", "Rajdhani", "Mono"],
  precision: ["3 dp", "5 dp", "Pips"],
  refreshRate: ["100 ms", "250 ms", "500 ms", "1 s"],
  timezone: ["UTC", "Local", "EST", "LON"],
};
