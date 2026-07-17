import type { Page } from "@playwright/test";

import type { PowerSaverPO } from "../contracts/PowerSaver";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightPowerSaver implements PowerSaverPO {
  constructor(private readonly page: Page) {}

  async click(): Promise<void> {
    await this.page.getByTestId(TESTIDS.shell.powerSaverToggle).click();
  }

  async documentFlag(): Promise<string> {
    return (
      (await this.page.locator("html").getAttribute("data-power-saver")) ?? ""
    );
  }
}
