import { expect, type Locator, type Page } from "@playwright/test";

import type { PositionsPanelPO } from "../contracts/PositionsPanel";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightPositionsPanel implements PositionsPanelPO {
  constructor(private readonly page: Page) {}

  private locator(): Locator {
    return this.page.getByTestId(TESTIDS.positions.panel);
  }

  private bubbles(): Locator {
    return this.locator().locator(
      `[data-testid^='${TESTIDS.positions.bubblePrefix}']`,
    );
  }

  private rows(): Locator {
    return this.locator().locator(
      `[data-testid^='${TESTIDS.positions.rowPrefix}']`,
    );
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.locator()).toBeVisible({ timeout: timeoutMs });
  }

  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }

  async bubbleCount(): Promise<number> {
    return await this.bubbles().count();
  }

  async firstBubbleSign(): Promise<string | null> {
    return await this.bubbles().first().getAttribute("data-sign");
  }

  async firstBubbleText(): Promise<string> {
    return await this.bubbles().first().innerText();
  }

  async rowCount(): Promise<number> {
    return await this.rows().count();
  }

  async firstRowSign(): Promise<string | null> {
    return await this.rows()
      .first()
      .locator("[data-sign]")
      .getAttribute("data-sign");
  }

  async firstRowText(): Promise<string> {
    return await this.rows().first().innerText();
  }
}
