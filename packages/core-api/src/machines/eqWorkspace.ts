import type { CandleTimeframe } from "@rtc/domain";

// Declared locally rather than imported from @rtc/motion-core — client-core
// must not depend on motion-core (see global constraints). These unify
// structurally with motion-core's ChartKind/IndicatorId equivalents.
export type EqChartType = "candles" | "line" | "area";
export type EqIndicatorId = "sma20" | "ema50";
export type EqPaneId = "rsi" | "macd";
export type EqYScale = "linear" | "log";

export interface EqWorkspaceState {
  readonly sel: string;
  readonly openTabs: readonly string[];
  readonly timeframe: CandleTimeframe;
  readonly chartType: EqChartType;
  readonly indicators: readonly EqIndicatorId[];
  readonly panes: readonly EqPaneId[];
  readonly yScale: EqYScale;
  /** The comparison-series symbol, or null for none. While non-null the
   * chart renders on a percent axis (derived downstream — `yScale` above is
   * NEVER mutated by compare, so clearing restores the stored lin/log). */
  readonly compare: string | null;
}

export interface EqWorkspaceIntents {
  select(sym: string): void;
  closeTab(sym: string): void;
  setTimeframe(tf: CandleTimeframe): void;
  setChartType(kind: EqChartType): void;
  toggleIndicator(id: EqIndicatorId): void;
  togglePane(id: EqPaneId): void;
  toggleYScale(): void;
  setCompare(sym: string | null): void;
}
