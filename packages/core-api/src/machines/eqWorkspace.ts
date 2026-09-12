import type { CandleTimeframe } from "@rtc/domain";

import type { Stream } from "#/stream";

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

export interface EqWorkspaceDeps {
  /** Symbol the workspace opens with — becomes the sole open tab and the
   * selection. Composition supplies the first watchlist symbol (falls back
   * to "" if none is known synchronously yet). */
  readonly initialSymbol: string;
  /** Optional async recovery source, used ONLY when `initialSymbol` arrives
   * "" (WS-real: the watchlist hasn't loaded synchronously at composition
   * time, unlike the simulator's synchronous `of(WATCHLIST)`). Emits the
   * resolved seed symbol once, when it first becomes known; the machine
   * takes exactly one emission and seeds `sel`/`openTabs` from it, but ONLY
   * if nothing has selected a symbol in the meantime (a user click or the
   * synchronous peek always wins over a late-arriving seed — see
   * `seedPatch$` below). Omitted by tests that don't care about the async
   * path (defaults to a source that never emits). */
  readonly seed$?: Stream<string>;
}
