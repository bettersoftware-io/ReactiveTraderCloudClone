export interface ConnectionOverlayPO {
  isHidden(): Promise<boolean>;
  waitVisible(timeoutMs: number): Promise<void>;
  waitHidden(timeoutMs: number): Promise<void>;
  text(): Promise<string>;
  /** Click the "Clear incident" button on the connection overlay. */
  clearIncident(): Promise<void>;
}
