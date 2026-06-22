import type { Page } from "@playwright/test";

import type { ThemeTogglePO } from "../contracts/ThemeToggle";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightThemeToggle implements ThemeTogglePO {
  constructor(private readonly page: Page) {}
  private locator() {
    return this.page.getByTestId(TESTIDS.shell.themeToggle);
  }
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible();
  }
  async click(): Promise<void> {
    await this.locator().click();
  }
  async ariaLabel(): Promise<string> {
    return (await this.locator().getAttribute("aria-label")) ?? "";
  }
}
