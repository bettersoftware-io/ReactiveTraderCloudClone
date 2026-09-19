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

  /** Uncaught page errors on whichever page `open()` most recently created —
   * fed by the `pageerror` listener registered there. `selectCore.ts`'s
   * fail-closed `VITE_CORE_IMPL` throw fires at module init, before ANY
   * route (including LoginScreen itself) renders, so a captured message here
   * is what actually happened when a subsequent wait times out. */
  private pageErrors: string[] = [];

  constructor(private readonly appPage: Page) {}

  private page(): Page {
    if (this.loginPage === undefined) {
      throw new Error("login screen not opened; call open() first");
    }

    return this.loginPage;
  }

  /** A captured page error that mentions VITE_CORE_IMPL — the fail-closed
   *  message from `selectCore.ts` — or undefined if boot succeeded. */
  private findBootError(): string | undefined {
    return this.pageErrors.find((message) => {
      return message.includes("VITE_CORE_IMPL");
    });
  }

  async open(): Promise<void> {
    const browser = this.appPage.context().browser();

    if (browser === null) {
      throw new Error("no Browser available to open an unseeded context from");
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    this.pageErrors = [];
    page.on("pageerror", (error) => {
      this.pageErrors.push(error.message);
    });
    await page.goto("/");
    this.loginPage = page;

    // A module-init throw (e.g. an invalid VITE_CORE_IMPL) crashes the whole
    // app before ANY route renders — including LoginScreen — and Playwright's
    // page.goto() does not reject on an in-page script error, only on a
    // navigation-level failure. By the time `load` fires the module has
    // already run (and thrown), so the pageerror is already captured here.
    // Surface it now, immediately, rather than letting whichever locator
    // wait runs next (e.g. waitVisible) time out with an opaque "element(s)
    // not found".
    const boot = this.findBootError();

    if (boot !== undefined) {
      throw new Error(`the app failed to boot: ${boot}`);
    }
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

  async waitCoreImpl(expected: string, timeoutMs: number): Promise<void> {
    try {
      await expect(this.page().locator("html")).toHaveAttribute(
        "data-core-impl",
        expected,
        { timeout: timeoutMs },
      );
    } catch (error) {
      const boot = this.findBootError();

      if (boot !== undefined) {
        throw new Error(`the app failed to boot: ${boot}`, { cause: error });
      }

      throw error;
    }
  }
}
