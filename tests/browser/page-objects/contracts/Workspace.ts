export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  openEquities(): Promise<void>;
  /**
   * Navigate to "/" with the dev-only `?narratorThresholds=test` query param
   * (see `buildBrowserPorts.ts`'s `devNarratorConfig`) — relaxes
   * `NarratorMachine`'s anomaly-detector thresholds so a proactive narration
   * fires within seconds of live sim ticks instead of the simulator's
   * natural ~14 min expected interval.
   */
  openWithNarratorThresholds(): Promise<void>;
  clickTab(tab: "fx" | "credit" | "admin" | "equities"): Promise<void>;
  /** Snapshot: is the given tab's nav button currently marked active
   *  (`data-active`, NavTab.tsx). */
  isTabActive(tab: "fx" | "credit" | "admin" | "equities"): Promise<boolean>;
  reload(): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  rootBackgroundColor(): Promise<string>;
  /** Click an element by its data-testid value. Use TESTIDS constants, not
   *  raw string literals, to satisfy the no-raw-testid grep gate. */
  clickTestId(id: string): Promise<void>;
  /** Driver-agnostic time-based wait. Used in scenarios that genuinely need
   *  a wall-clock pause (e.g. "wait N seconds for the system to react"). */
  wait(ms: number): Promise<void>;
}
