import { expect, type Page } from "@playwright/test";

import type {
  PreferencesPO,
  PrefsChartSubstrate,
  PrefsCoreImpl,
  PrefsLayoutEngine,
} from "../contracts/Preferences.ts";
import { TESTIDS } from "../contracts/testids.ts";

/** The one storage key the app keeps a person's own model key under
 * (packages/web-boot's BrowserOwnKeyStore). */
const OWN_KEY_STORAGE_NAME = "rt-jarvis-own-key";

export class PlaywrightPreferences implements PreferencesPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.accountToggle).click();
    await this.page.getByTestId(TESTIDS.prefs.openTrigger).click();
  }

  async waitModalVisible(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.prefs.modal)).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async waitModalHoldsFocus(timeoutMs: number): Promise<void> {
    await this.page.waitForFunction(
      (modalTestId) => {
        const modal = document.querySelector(`[data-testid="${modalTestId}"]`);
        return modal?.contains(document.activeElement) ?? false;
      },
      TESTIDS.prefs.modal,
      { timeout: timeoutMs },
    );
  }

  async selectChartSubstrate(value: PrefsChartSubstrate): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.prefs.chartSubstrateSegment(value))
      .click();
  }

  async selectLayoutEngine(value: PrefsLayoutEngine): Promise<void> {
    await this.page
      .getByTestId(TESTIDS.prefs.layoutEngineSegment(value))
      .click();
  }

  async selectCoreImpl(value: PrefsCoreImpl): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.coreImplSegment(value)).click();
  }

  async waitCoreImplSelected(
    value: PrefsCoreImpl,
    timeoutMs: number,
  ): Promise<void> {
    await expect(
      this.page.getByTestId(TESTIDS.prefs.coreImplSegment(value)),
    ).toHaveAttribute("aria-pressed", "true", { timeout: timeoutMs });
  }

  async close(): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.done).click();
  }

  async waitModalHidden(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.prefs.modal)).toBeHidden({
      timeout: timeoutMs,
    });
  }

  async saveOwnKey(key: string): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.ownKeyInput).fill(key);
    await this.page.getByTestId(TESTIDS.prefs.ownKeySave).click();
  }

  async waitOwnKeyStatus(text: string, timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.prefs.ownKeyStatus)).toHaveText(
      text,
      { timeout: timeoutMs },
    );
  }

  async ownKeyMasked(): Promise<string> {
    return await this.page.getByTestId(TESTIDS.prefs.ownKeyMasked).innerText();
  }

  async chooseOwnBrain(brain: string, timeoutMs: number): Promise<void> {
    const option = this.page.getByTestId(TESTIDS.prefs.ownBrainSegment(brain));
    await expect(option).toBeEnabled({ timeout: timeoutMs });
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true", {
      timeout: timeoutMs,
    });
  }

  async signOut(): Promise<void> {
    await this.page.getByTestId(TESTIDS.prefs.accountToggle).click();
    await this.page.getByTestId(TESTIDS.prefs.signOut).click();
  }

  async waitSignedOut(timeoutMs: number): Promise<void> {
    await expect(this.page.getByTestId(TESTIDS.auth.loginScreen)).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async ownKeyInBrowserStorage(): Promise<boolean> {
    return await this.page.evaluate((name) => {
      return (
        window.sessionStorage.getItem(name) !== null ||
        window.localStorage.getItem(name) !== null
      );
    }, OWN_KEY_STORAGE_NAME);
  }
}
