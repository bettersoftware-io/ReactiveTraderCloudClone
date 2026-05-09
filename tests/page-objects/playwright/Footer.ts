import type { Page } from "@playwright/test";
import type { FooterPO } from "../contracts/Footer";

export class PlaywrightFooter implements FooterPO {
  constructor(private readonly page: Page) {}
  connectionLabel(): Promise<string> { throw notYet("Footer.connectionLabel"); }
  isStatusVisible(): Promise<boolean> { throw notYet("Footer.isStatusVisible"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
