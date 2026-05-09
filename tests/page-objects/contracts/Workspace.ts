export interface WorkspacePO {
  open(): Promise<void>;
  openFx(): Promise<void>;
  openCredit(): Promise<void>;
  openAdmin(): Promise<void>;
  clickTab(tab: "fx" | "credit" | "admin"): Promise<void>;
  reload(): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  rootBackgroundColor(): Promise<string>;
}
