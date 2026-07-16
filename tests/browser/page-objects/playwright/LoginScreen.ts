import { expect, type Page } from "@playwright/test";

import type { LoginScreenPO } from "../contracts/LoginScreen";
import { TESTIDS } from "../contracts/testids";

/**
 * Playwright impl of {@link LoginScreenPO}. Constructed with the PRIMARY app
 * page (whose browser context has the authenticated-session `addInitScript`
 * seed registered by ./_context.ts), `open()` spawns a genuinely FRESH,
 * unseeded `BrowserContext` — not `appPage.context().newPage()`, which would
 * inherit the seed and skip straight past AuthGate — so the real LoginScreen
 * actually renders. All locators target that second context's page, so the
 * scenario/spec layers never see a raw `page` handle.
 */
export class PlaywrightLoginScreen implements LoginScreenPO {
  private loginPage: Page | undefined;

  constructor(private readonly appPage: Page) {}

  private page(): Page {
    if (this.loginPage === undefined) {
      throw new Error("login screen not opened; call open() first");
    }

    return this.loginPage;
  }

  async open(): Promise<void> {
    const browser = this.appPage.context().browser();

    if (browser === null) {
      throw new Error("no Browser available to open an unseeded context from");
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/");
    this.loginPage = page;
  }

  async waitVisible(timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.auth.loginScreen)).toBeVisible(
      { timeout: timeoutMs },
    );
  }

  async waitTitle(expected: string, timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.auth.loginTitle)).toHaveText(
      expected,
      { timeout: timeoutMs },
    );
  }

  async typeUsername(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginUsername).fill(value);
  }

  async typePassword(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginPassword).fill(value);
  }

  async submit(): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginSubmit).click();
  }

  async waitErrorText(expected: string, timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.auth.loginError)).toHaveText(
      expected,
      { timeout: timeoutMs },
    );
  }

  async waitGone(timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.auth.loginScreen)).toHaveCount(
      0,
      { timeout: timeoutMs },
    );
  }

  async waitAppShell(timeoutMs: number): Promise<void> {
    await expect(this.page().getByTestId(TESTIDS.shell.header)).toBeVisible({
      timeout: timeoutMs,
    });
  }
}
