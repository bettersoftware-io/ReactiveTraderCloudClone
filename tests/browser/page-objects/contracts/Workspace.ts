/** Options forwarded to driver-level click implementations. */
export interface ClickOptions {
  /** Bypass pointer-event interception checks (e.g. element hidden behind overlay). */
  force?: boolean;
}

export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void>;
  reload(): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  rootBackgroundColor(): Promise<string>;
  /** Click an element by its data-testid value. Use TESTIDS constants, not
   *  raw string literals, to satisfy the no-raw-testid grep gate.
   *  Pass `{ force: true }` to bypass pointer-event interception (e.g. when
   *  the connection overlay covers the target element). */
  clickTestId(id: string, options?: ClickOptions): Promise<void>;
  /** Driver-agnostic time-based wait. Used in scenarios that genuinely need
   *  a wall-clock pause (e.g. "wait N seconds for the system to react"). */
  wait(ms: number): Promise<void>;
}
