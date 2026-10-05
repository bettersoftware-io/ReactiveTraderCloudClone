export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  openEquities(): Promise<void>;
  /**
   * Navigate to "/" with the `?narratorThresholds=test` query param
   * (see `buildBrowserPorts.ts`'s `seamNarratorConfig`) — relaxes
   * `NarratorMachine`'s anomaly-detector thresholds so a proactive narration
   * fires within seconds of live sim ticks instead of the simulator's
   * natural ~14 min expected interval.
   */
  openWithNarratorThresholds(): Promise<void>;
  /**
   * Navigate to "/?core=<impl>" — the load-time `?core=` override
   * (`coreSelection.ts`'s `resolveCoreChoice`, highest-precedence, this load
   * only). `impl` is a raw string (not the `CoreImpl` union) so callers can
   * also exercise an unrecognized value (e.g. "bogus" — ignored, falls
   * through to the stored choice).
   */
  openWithCoreImpl(impl: string): Promise<void>;
  /**
   * Waits until the current URL no longer carries `?core=` — the real page
   * navigation `createCoreSelection().select()` performs once a choice is
   * persisted (see `coreSelection.ts`'s `select`, `main.tsx`'s
   * `navigate: (href) => location.assign(href)`).
   */
  waitUrlHasNoCoreParam(timeoutMs: number): Promise<void>;
  /** Wait until the document root's `data-core-impl` reads exactly `expected`
   *  — the application core the app actually booted on (set by `main.tsx`
   *  once `bootApp.ts`'s `bootCore` resolves). Unlike
   *  `LoginScreenPO.waitCoreImpl` (a second, unauthenticated context/page,
   *  Playwright-only), this reads the SAME page every other `WorkspacePO`
   *  method drives. */
  waitCoreImpl(expected: string, timeoutMs: number): Promise<void>;
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
