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
   * Waits until the current URL no longer carries `?core=` — the core host
   * strips it with `history.replaceState` once an in-place core swap lands
   * (`coreHost.ts`'s `stripCoreParam`, wired in each client's `main.tsx`).
   */
  waitUrlHasNoCoreParam(timeoutMs: number): Promise<void>;
  /**
   * Sets a mark on the current document's `window` that only a navigation
   * can remove — the witness that a later step happened WITHOUT one (an
   * in-place core swap), read back by `navigationMark`.
   */
  setNavigationMark(): Promise<void>;
  /** The mark `setNavigationMark` set: `1` on the same document, `undefined`
   *  once any navigation (a reload included) replaced it. */
  navigationMark(): Promise<number | undefined>;
  /**
   * Starts recording, on the current document, whether the login screen is
   * ever on screen from now on — for even a single frame. Read back by
   * `loginScreenSeen`; a navigation discards it.
   */
  watchForLoginScreen(): Promise<void>;
  /** Whether the login screen has been on screen since `watchForLoginScreen`. */
  loginScreenSeen(): Promise<boolean>;
  /** Waits until the signed-in app shell (its header) is visible and no
   *  login screen is in the DOM. */
  waitSignedIn(timeoutMs: number): Promise<void>;
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
