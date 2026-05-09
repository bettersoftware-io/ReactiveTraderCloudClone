import type { Page } from "@playwright/test";
import type { ConnectionOverlayPO } from "../contracts/ConnectionOverlay";

export class PlaywrightConnectionOverlay implements ConnectionOverlayPO {
  constructor(private readonly page: Page) {}
  isHidden(): Promise<boolean> { throw notYet("ConnectionOverlay.isHidden"); }
  waitVisible(_t: number): Promise<void> { throw notYet("ConnectionOverlay.waitVisible"); }
  waitHidden(_t: number): Promise<void> { throw notYet("ConnectionOverlay.waitHidden"); }
  text(): Promise<string> { throw notYet("ConnectionOverlay.text"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
