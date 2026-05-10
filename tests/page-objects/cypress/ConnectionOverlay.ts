import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";

function notYet(name: string): never {
  throw new Error(`CypressConnectionOverlay.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressConnectionOverlay implements ConnectionOverlayPO {
  isHidden(): Promise<boolean> { notYet("isHidden"); }
  waitVisible(timeoutMs: number): Promise<void> { notYet("waitVisible"); }
  waitHidden(timeoutMs: number): Promise<void> { notYet("waitHidden"); }
  text(): Promise<string> { notYet("text"); }
}
