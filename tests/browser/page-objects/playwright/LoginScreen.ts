import { expect, type Page } from "@playwright/test";

import { watchCspViolations } from "#/browser/cspViolations.ts";

import type { AccountField, LoginScreenPO } from "../contracts/LoginScreen.ts";
import { TESTIDS } from "../contracts/testids.ts";
import { awaitAppMount, navigateAndAwaitMount } from "./appMount.ts";

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
   * fed by the `pageerror` listener registered there. `coreSelection.ts`'s
   * `resolveCoreChoice` fail-closed `VITE_CORE_IMPL` throw fires
   * synchronously out of `bootApp.ts`'s (deliberately non-`async`) `bootCore`
   * at module init, before ANY route (including LoginScreen itself) renders
   * — an uncaught exception, exactly like `selectCore.ts`'s throw before it
   * — so a captured message here is what actually happened when a
   * subsequent wait times out. (A rejected chunk *load* is the other, DOM-
   * rendered failure mode — see `renderBootError` — and does not reach
   * `pageerror` at all; this scan is only ever for the build-default case.) */
  private pageErrors: string[] = [];

  /** URL paths of every request the login page made since `open()`. */
  private requestPaths: string[] = [];

  private violations: string[] = [];

  private readonly appPage: Page;

  constructor(appPage: Page) {
    this.appPage = appPage;
  }

  private page(): Page {
    if (this.loginPage === undefined) {
      throw new Error("login screen not opened; call open() first");
    }

    return this.loginPage;
  }

  /** A captured page error that mentions VITE_CORE_IMPL — the fail-closed
   *  message from `coreSelection.ts`'s `resolveCoreChoice` — or undefined if
   *  boot succeeded. */
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
    this.violations = watchCspViolations(context);
    this.pageErrors = [];
    page.on("pageerror", (error) => {
      this.pageErrors.push(error.message);
    });
    this.requestPaths = [];
    page.on("request", (request) => {
      this.requestPaths.push(new URL(request.url()).pathname);
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

    // No module-init throw — now wait for the app to actually MOUNT: the
    // async/Effect cores load through a dynamic import(), so `load` can fire
    // on a still-empty #root (see appMount.ts). The navigation has
    // already happened, so this only waits.
    await awaitAppMount(page, this.pageErrors);
  }

  cspViolations(): readonly string[] {
    return this.violations;
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

  async waitFieldError(
    field: AccountField,
    expected: string,
    timeoutMs: number,
  ): Promise<void> {
    const page = this.page();

    await expect(
      page
        .getByTestId(TESTIDS.auth.loginFieldError)
        .and(page.locator(`[data-field="${field}"]`)),
    ).toHaveText(expected, { timeout: timeoutMs });
  }

  async hasLoginError(): Promise<boolean> {
    return (await this.page().getByTestId(TESTIDS.auth.loginError).count()) > 0;
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

  async hasCreateAccountLink(): Promise<boolean> {
    return (
      (await this.page().getByTestId(TESTIDS.auth.loginCreateAccount).count()) >
      0
    );
  }

  async openCreateAccount(): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginCreateAccount).click();
  }

  async openForgotPassword(): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginForgotPassword).click();
  }

  async typeEmail(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginEmail).fill(value);
  }

  async typeDisplayName(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginDisplayName).fill(value);
  }

  async typeNewPassword(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginNewPassword).fill(value);
  }

  async typeCode(value: string): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginCode).fill(value);
  }

  async waitPhase(expected: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.auth.loginPhase),
    ).toHaveAttribute("data-phase", expected, { timeout: timeoutMs });
  }

  async waitCodeSentTo(email: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.auth.loginCodeEmail),
    ).toContainText(email, { timeout: timeoutMs });
  }

  async waitNotice(containsText: string, timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.auth.loginNotice),
    ).toContainText(containsText, { timeout: timeoutMs });
  }

  async takeNoticeAction(): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginNoticeAction).click();
  }

  async goBack(): Promise<void> {
    await this.page().getByTestId(TESTIDS.auth.loginBack).click();
  }

  async browserBack(): Promise<void> {
    await this.page().goBack();
  }

  async browserForward(): Promise<void> {
    await this.page().goForward();
  }

  async waitUrlPath(expected: string, timeoutMs: number): Promise<void> {
    const page = this.page();

    await expect
      .poll(
        () => {
          return new URL(page.url()).pathname;
        },
        { timeout: timeoutMs },
      )
      .toBe(expected);
  }

  countRequestsTo(path: string): number {
    return this.requestPaths.filter((requested) => {
      return requested.endsWith(path);
    }).length;
  }

  async openPath(path: string): Promise<void> {
    const page = this.page();
    await navigateAndAwaitMount(page, () => {
      return page.goto(path);
    });
  }

  async openAdminTab(): Promise<void> {
    await this.page().getByTestId(TESTIDS.shell.tab("admin")).click();
  }

  async waitAdminTabAbsent(timeoutMs: number): Promise<void> {
    await expect(
      this.page().getByTestId(TESTIDS.shell.tab("admin")),
    ).toHaveCount(0, { timeout: timeoutMs });
  }

  async approveAccount(email: string, timeoutMs: number): Promise<void> {
    const page = this.page();
    const row = page
      .locator(`[data-testid^="${TESTIDS.admin.rowPrefix}"]`)
      .filter({
        has: page
          .locator(`[data-testid^="${TESTIDS.admin.emailPrefix}"]`)
          .getByText(email, { exact: true }),
      });

    const approve = row.locator(
      `[data-testid^="${TESTIDS.admin.approvePrefix}"]`,
    );

    await expect(approve).toBeVisible({ timeout: timeoutMs });
    await approve.click();
    await expect(approve).toHaveCount(0, { timeout: timeoutMs });
  }
}
