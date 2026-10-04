import type { Locator, Page } from "@playwright/test";

import type { ThemeTogglePO } from "../contracts/ThemeToggle.ts";
import { TESTIDS } from "../contracts/testids.ts";

export class PlaywrightThemeToggle implements ThemeTogglePO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private locator(): Locator {
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
