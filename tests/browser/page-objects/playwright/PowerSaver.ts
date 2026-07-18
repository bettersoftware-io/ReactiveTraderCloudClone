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

  async connectionDotAnimationDuration(): Promise<string> {
    // The dot is the first `[data-status]` descendant of `connection-status`
    // (ConnectionStatusBar.tsx: the dot span precedes the label span) — CSS
    // module class names are hashed, so anchor on the stable testid + the
    // plain `data-status` attribute rather than a generated class.
    const dot = this.page
      .locator(`[data-testid="${TESTIDS.connection.status}"] [data-status]`)
      .first();

    return await dot.evaluate((el) => {
      return getComputedStyle(el).animationDuration;
    });
  }
}
