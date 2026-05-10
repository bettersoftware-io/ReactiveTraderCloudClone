export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void>;
  reload(): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  rootBackgroundColor(): Promise<string>;
  /** Driver-agnostic time-based wait. Used in scenarios that genuinely need
   *  a wall-clock pause (e.g. "wait N seconds for the system to react"). */
  wait(ms: number): Promise<void>;
}
