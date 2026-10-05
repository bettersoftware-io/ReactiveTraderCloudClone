/**
 * `DriveCommand` v1 — the closed command vocabulary a Jarvis brain emits to
 * act on the desk directly: switch tabs, resize/dismiss panels, drive the
 * equities chart controls, change theme/power-saver. The application-core
 * contract names these types, so they are domain vocabulary. `@rtc/shared`
 * holds what the wire adds on top: `parseDriveBatch` and
 * `DRIVE_COMMAND_JSON_SCHEMA`, both derived from the `const` arrays below so
 * the two descriptions of "what kinds exist" cannot drift apart.
 */

export const DRIVE_TABS = ["fx", "credit", "equities", "admin"] as const;
export type DriveTab = (typeof DRIVE_TABS)[number];

export const DRIVE_LAYOUT_OPS = [
  "maximize",
  "restore",
  "collapse",
  "expand",
] as const;
type DriveLayoutOp = (typeof DRIVE_LAYOUT_OPS)[number];

export const DRIVE_TIMEFRAMES = ["1D", "1W", "1M", "3M"] as const;
type DriveTimeframe = (typeof DRIVE_TIMEFRAMES)[number];

export const DRIVE_CHART_TYPES = ["candles", "line", "area"] as const;
type DriveChartType = (typeof DRIVE_CHART_TYPES)[number];

export const DRIVE_INDICATORS = ["sma20", "ema50"] as const;
type DriveIndicator = (typeof DRIVE_INDICATORS)[number];

export const DRIVE_PANES = ["rsi", "macd"] as const;
type DrivePane = (typeof DRIVE_PANES)[number];

export const DRIVE_SKINS = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
  "neon",
] as const;
type DriveSkin = (typeof DRIVE_SKINS)[number];

export const DRIVE_POWER_LEVELS = ["off", "calm", "freeze"] as const;
type DrivePowerLevel = (typeof DRIVE_POWER_LEVELS)[number];

export const DRIVE_COMMAND_KINDS = [
  "switchTab",
  "layout",
  "eqSelect",
  "eqTimeframe",
  "eqChartType",
  "eqIndicator",
  "eqPane",
  "setTheme",
  "setPowerSaver",
  "dismissPanel",
  "dockPanel",
  "undockPanel",
] as const;

export type DriveCommandV1 =
  | { readonly kind: "switchTab"; readonly tab: DriveTab }
  | {
      readonly kind: "layout";
      readonly op: DriveLayoutOp;
      readonly tab: DriveTab;
      readonly panelId: string;
    }
  | { readonly kind: "eqSelect"; readonly symbol: string }
  | { readonly kind: "eqTimeframe"; readonly tf: DriveTimeframe }
  | { readonly kind: "eqChartType"; readonly chart: DriveChartType }
  | {
      readonly kind: "eqIndicator";
      readonly id: DriveIndicator;
      readonly on: boolean;
    }
  | { readonly kind: "eqPane"; readonly id: DrivePane; readonly on: boolean }
  | { readonly kind: "setTheme"; readonly skin: DriveSkin }
  | { readonly kind: "setPowerSaver"; readonly level: DrivePowerLevel }
  | { readonly kind: "dismissPanel"; readonly panelId: string }
  | { readonly kind: "dockPanel"; readonly panelId: string }
  | { readonly kind: "undockPanel"; readonly panelId: string };

export interface DriveBatchV1 {
  readonly v: 1;
  /** 1-8 commands, applied in order. */
  readonly commands: readonly DriveCommandV1[];
}
